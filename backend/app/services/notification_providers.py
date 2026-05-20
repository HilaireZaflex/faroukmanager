"""
Providers d'envoi de notifications.
====================================
Architecture pluggable : chaque canal a son provider.
Si les credentials ne sont pas configurés, un provider DRY-RUN est utilisé
(aucun appel externe, simulation logée).

Variables d'environnement supportées :
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
  WHATSAPP_PHONE_ID, WHATSAPP_ACCESS_TOKEN
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
  NOTIFICATIONS_DRY_RUN=true       # Forcer le mode simulation
"""
from __future__ import annotations
import os
import re
import logging
import smtplib
from abc import ABC, abstractmethod
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

DRY_RUN = os.getenv("NOTIFICATIONS_DRY_RUN", "").lower() in ("1", "true", "yes")


def _normalize_phone_e164(phone: str, default_country: str = "223") -> str:
    """Normalise un numéro Mali (+223) au format E.164."""
    if not phone: return ""
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("00"): digits = digits[2:]
    if digits.startswith(default_country):
        return f"+{digits}"
    if len(digits) == 8:  # Numéro Mali sans indicatif
        return f"+{default_country}{digits}"
    if not digits.startswith("+"):
        return f"+{digits}"
    return digits


# ─────────────────────────────────────────────────────────────────────────────
# Provider abstrait
# ─────────────────────────────────────────────────────────────────────────────
class BaseProvider(ABC):
    name: str = "base"

    @abstractmethod
    def is_configured(self) -> bool: ...

    @abstractmethod
    def send(self, *, to: str, title: str, message: str, **kwargs) -> Dict[str, Any]:
        """Renvoie {ok: bool, provider: str, status: str, error?: str, external_id?: str}"""


# ─────────────────────────────────────────────────────────────────────────────
# Provider DRY-RUN (par défaut, pour dev/test)
# ─────────────────────────────────────────────────────────────────────────────
class DryRunProvider(BaseProvider):
    name = "dry-run"

    def __init__(self, channel: str):
        self.channel = channel

    def is_configured(self) -> bool:
        return True

    def send(self, *, to: str, title: str, message: str, **kwargs) -> Dict[str, Any]:
        logger.info(f"[DRY-RUN/{self.channel}] → {to} | {title} | {message[:80]}…")
        return {"ok": True, "provider": f"dry-run-{self.channel}",
                "status": "SIMULATED", "external_id": None}


# ─────────────────────────────────────────────────────────────────────────────
# Twilio SMS
# ─────────────────────────────────────────────────────────────────────────────
class TwilioSMSProvider(BaseProvider):
    name = "twilio-sms"

    def __init__(self):
        self.sid = os.getenv("TWILIO_ACCOUNT_SID", "")
        self.token = os.getenv("TWILIO_AUTH_TOKEN", "")
        self.from_number = os.getenv("TWILIO_FROM_NUMBER", "")

    def is_configured(self) -> bool:
        return bool(self.sid and self.token and self.from_number)

    def send(self, *, to: str, title: str, message: str, **kwargs) -> Dict[str, Any]:
        try:
            from twilio.rest import Client
        except ImportError:
            return {"ok": False, "provider": self.name, "status": "FAILED",
                    "error": "Le package 'twilio' n'est pas installé. pip install twilio"}
        try:
            client = Client(self.sid, self.token)
            full_text = f"{title}\n{message}" if title else message
            full_text = full_text[:1500]  # Limite SMS prudente
            msg = client.messages.create(
                from_=self.from_number,
                to=_normalize_phone_e164(to),
                body=full_text,
            )
            return {"ok": True, "provider": self.name, "status": "SENT",
                    "external_id": msg.sid}
        except Exception as e:
            logger.exception("Twilio SMS send failed")
            return {"ok": False, "provider": self.name, "status": "FAILED",
                    "error": str(e)[:300]}


# ─────────────────────────────────────────────────────────────────────────────
# WhatsApp Cloud API (Meta Business)
# ─────────────────────────────────────────────────────────────────────────────
class WhatsAppCloudProvider(BaseProvider):
    name = "whatsapp-cloud"

    def __init__(self):
        self.phone_id = os.getenv("WHATSAPP_PHONE_ID", "")
        self.access_token = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
        self.api_version = os.getenv("WHATSAPP_API_VERSION", "v20.0")

    def is_configured(self) -> bool:
        return bool(self.phone_id and self.access_token)

    def send(self, *, to: str, title: str, message: str, **kwargs) -> Dict[str, Any]:
        try:
            import requests
        except ImportError:
            return {"ok": False, "provider": self.name, "status": "FAILED",
                    "error": "Le package 'requests' n'est pas installé"}
        try:
            phone = _normalize_phone_e164(to).lstrip("+")
            url = f"https://graph.facebook.com/{self.api_version}/{self.phone_id}/messages"
            body_text = f"*{title}*\n\n{message}" if title else message
            body_text = body_text[:4096]
            payload = {
                "messaging_product": "whatsapp",
                "to": phone,
                "type": "text",
                "text": {"body": body_text, "preview_url": False},
            }
            headers = {
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
            }
            r = requests.post(url, json=payload, headers=headers, timeout=10)
            if r.status_code in (200, 201):
                data = r.json()
                msg_id = (data.get("messages") or [{}])[0].get("id")
                return {"ok": True, "provider": self.name, "status": "SENT",
                        "external_id": msg_id}
            return {"ok": False, "provider": self.name, "status": "FAILED",
                    "error": f"HTTP {r.status_code}: {r.text[:300]}"}
        except Exception as e:
            logger.exception("WhatsApp send failed")
            return {"ok": False, "provider": self.name, "status": "FAILED",
                    "error": str(e)[:300]}


# ─────────────────────────────────────────────────────────────────────────────
# Email SMTP
# ─────────────────────────────────────────────────────────────────────────────
class SMTPEmailProvider(BaseProvider):
    name = "smtp"

    def __init__(self):
        self.host = os.getenv("SMTP_HOST", "")
        self.port = int(os.getenv("SMTP_PORT", "587") or 587)
        self.user = os.getenv("SMTP_USER", "")
        self.password = os.getenv("SMTP_PASSWORD", "")
        self.from_addr = os.getenv("SMTP_FROM", self.user)
        self.use_tls = os.getenv("SMTP_TLS", "true").lower() != "false"

    def is_configured(self) -> bool:
        return bool(self.host and self.from_addr)

    def send(self, *, to: str, title: str, message: str, **kwargs) -> Dict[str, Any]:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = title or "Notification FaroukManager"
            msg["From"] = self.from_addr
            msg["To"] = to
            msg.attach(MIMEText(message, "plain", "utf-8"))
            html = f"""<html><body style="font-family:sans-serif">
                <h3 style="color:#FF6900">{title}</h3>
                <p>{message.replace(chr(10), '<br/>')}</p>
                <hr/><small>FaroukManager — Réseau Orange Mali</small>
            </body></html>"""
            msg.attach(MIMEText(html, "html", "utf-8"))

            with smtplib.SMTP(self.host, self.port, timeout=10) as s:
                if self.use_tls:
                    s.starttls()
                if self.user and self.password:
                    s.login(self.user, self.password)
                s.sendmail(self.from_addr, [to], msg.as_string())
            return {"ok": True, "provider": self.name, "status": "SENT", "external_id": None}
        except Exception as e:
            logger.exception("SMTP send failed")
            return {"ok": False, "provider": self.name, "status": "FAILED",
                    "error": str(e)[:300]}


# ─────────────────────────────────────────────────────────────────────────────
# Registry & dispatcher
# ─────────────────────────────────────────────────────────────────────────────
_REGISTRY: Dict[str, BaseProvider] = {}


def get_provider(channel: str) -> BaseProvider:
    """Renvoie le provider approprié pour un canal (cache simple)."""
    if channel in _REGISTRY:
        return _REGISTRY[channel]

    if DRY_RUN:
        prov: BaseProvider = DryRunProvider(channel)
    elif channel == "SMS":
        prov = TwilioSMSProvider()
        if not prov.is_configured(): prov = DryRunProvider("SMS")
    elif channel == "WHATSAPP":
        prov = WhatsAppCloudProvider()
        if not prov.is_configured(): prov = DryRunProvider("WHATSAPP")
    elif channel == "EMAIL":
        prov = SMTPEmailProvider()
        if not prov.is_configured(): prov = DryRunProvider("EMAIL")
    else:
        prov = DryRunProvider(channel)

    _REGISTRY[channel] = prov
    return prov


def status_summary() -> Dict[str, Any]:
    """État de configuration de chaque provider (utile pour l'UI)."""
    out = {"dry_run_mode": DRY_RUN, "providers": {}}
    for ch in ("SMS", "WHATSAPP", "EMAIL"):
        prov = get_provider(ch)
        out["providers"][ch] = {
            "name": prov.name,
            "configured": prov.is_configured() and not isinstance(prov, DryRunProvider),
            "active_provider": prov.name,
        }
    return out


def reset_cache():
    """Vider le cache des providers (utile pour reload de config)."""
    _REGISTRY.clear()
