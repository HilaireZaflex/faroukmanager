"""Service Rapport PDF Évaluation — Logo FAROUK DISTRIBUTION."""
from io import BytesIO
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.evaluation import EvalCampaign, EvalScore, EvalRoleType


def generate_pdf(db: Session, campaign_id: int, user_id: int) -> bytes:
    c = db.query(EvalCampaign).get(campaign_id)
    if not c: raise HTTPException(404, "Campagne introuvable")
    score = db.query(EvalScore).filter(
        EvalScore.campaign_id == campaign_id, EvalScore.user_id == user_id).first()
    if not score: raise HTTPException(404, "Score introuvable — calculez d'abord le score")
    user = score.user
    agent_name = f"{user.prenom or ''} {user.nom}".strip() if user else "—"
    role = user.role.value.upper() if user else "—"

    try:
        return _generate_with_reportlab(c, score, agent_name, role)
    except ImportError:
        return _generate_text_fallback(c, score, agent_name, role)


def _score_color(score: float):
    if score >= 70: return (0.13, 0.59, 0.33)    # vert
    if score >= 50: return (1.0, 0.42, 0.0)        # orange
    return (0.86, 0.20, 0.18)                       # rouge


def _generate_with_reportlab(campaign, score, agent_name: str, role: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.colors import HexColor, white, black, Color
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            rightMargin=2*cm, leftMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    ORANGE = HexColor("#FF6900")
    DARK = HexColor("#0f172a")
    GRAY = HexColor("#64748b")
    GREEN = HexColor("#16a34a")
    RED = HexColor("#dc2626")

    story = []

    # ── HEADER ────────────────────────────────────────────────────────────
    header_data = [[
        Paragraph('<font color="#FF6900"><b>FAROUK DISTRIBUTION</b></font>', ParagraphStyle(
            'hdr', fontSize=18, fontName='Helvetica-Bold', alignment=TA_LEFT)),
        Paragraph('Réseau Orange Mali<br/><font color="#64748b" size="9">Confidentiel</font>',
                  ParagraphStyle('sub', fontSize=10, alignment=TA_RIGHT)),
    ]]
    header_table = Table(header_data, colWidths=[10*cm, 7*cm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LINEBELOW', (0,0), (-1,0), 2, ORANGE),
        ('BOTTOMPADDING', (0,0), (-1,0), 8),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 0.5*cm))

    # ── TITRE ─────────────────────────────────────────────────────────────
    story.append(Paragraph(
        f"<b>RAPPORT D'ÉVALUATION — {role}</b>",
        ParagraphStyle('title', fontSize=16, textColor=DARK, alignment=TA_CENTER,
                       fontName='Helvetica-Bold', spaceBefore=10, spaceAfter=4)))
    story.append(Paragraph(
        f"Période : <b>{campaign.period_key}</b> · {campaign.name}",
        ParagraphStyle('period', fontSize=10, textColor=GRAY, alignment=TA_CENTER, spaceAfter=12)))
    story.append(HRFlowable(width="100%", thickness=1, color=HexColor("#e2e8f0")))
    story.append(Spacer(1, 0.4*cm))

    # ── INFO AGENT ────────────────────────────────────────────────────────
    info_data = [
        ["Agent évalué", agent_name],
        ["Rôle", role],
        ["Date génération", datetime.utcnow().strftime("%d/%m/%Y %H:%M")],
        ["Campagne", campaign.name],
    ]
    info_table = Table(info_data, colWidths=[5*cm, 12*cm])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 10),
        ('TEXTCOLOR', (0,0), (0,-1), GRAY),
        ('ROWBACKGROUNDS', (0,0), (-1,-1), [HexColor("#f8fafc"), white]),
        ('GRID', (0,0), (-1,-1), 0.5, HexColor("#e2e8f0")),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.6*cm))

    # ── SCORE FINAL ───────────────────────────────────────────────────────
    score_val = score.score_final or 0
    sr, sg, sb = _score_color(score_val)
    score_color = Color(sr, sg, sb)
    story.append(Paragraph(
        f'<font color="#{int(sr*255):02x}{int(sg*255):02x}{int(sb*255):02x}"><b>{score_val}/100</b></font>',
        ParagraphStyle('big_score', fontSize=36, alignment=TA_CENTER, fontName='Helvetica-Bold',
                       spaceBefore=4, spaceAfter=2)))
    story.append(Paragraph(
        f"<b>{score.score_label or '—'}</b>",
        ParagraphStyle('label', fontSize=14, alignment=TA_CENTER, spaceAfter=16)))

    # Barre de score
    bar_data = [["", ""]]
    bar_table = Table(bar_data, colWidths=[score_val/100*17*cm, (100-score_val)/100*17*cm])
    bar_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), score_color),
        ('BACKGROUND', (1,0), (1,0), HexColor("#e2e8f0")),
        ('ROWHEIGHT', (0,0), (0,0), 10),
        ('BOX', (0,0), (-1,-1), 0, white),
    ]))
    story.append(bar_table)
    story.append(Spacer(1, 0.6*cm))

    # ── SCORES PAR DIMENSION ──────────────────────────────────────────────
    story.append(Paragraph("<b>Scores par dimension</b>",
                           ParagraphStyle('sec', fontSize=12, textColor=DARK,
                                          fontName='Helvetica-Bold', spaceAfter=6)))
    dim_data = [["Dimension", "Score", "Max"]]
    dims = [
        ("KPI automatiques", score.score_kpi),
        ("Appels mystères", score.score_mystery),
        ("Notes manuelles RC/Admin", score.score_manual),
    ]
    for label, val in dims:
        if val is not None:
            dim_data.append([label, f"{val:.1f}", "100"])
    dim_table = Table(dim_data, colWidths=[12*cm, 3*cm, 2*cm])
    dim_table.setStyle(TableStyle([
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('BACKGROUND', (0,0), (-1,0), ORANGE),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [HexColor("#f8fafc"), white]),
        ('GRID', (0,0), (-1,-1), 0.5, HexColor("#e2e8f0")),
        ('ALIGN', (1,0), (-1,-1), 'CENTER'),
        ('PADDING', (0,0), (-1,-1), 6),
        ('FONTSIZE', (0,0), (-1,-1), 10),
    ]))
    story.append(dim_table)
    story.append(Spacer(1, 0.4*cm))

    # ── KPI DÉTAIL ────────────────────────────────────────────────────────
    if score.kpi_data:
        story.append(Paragraph("<b>Détail des KPI</b>",
                               ParagraphStyle('sec2', fontSize=12, textColor=DARK,
                                              fontName='Helvetica-Bold', spaceAfter=6)))
        kpi_rows = [["Indicateur", "Valeur"]]
        for k, v in score.kpi_data.items():
            if v is not None:
                label = k.replace("_", " ").title()
                val_str = f"{v:,.1f}" if isinstance(v, float) else str(v)
                kpi_rows.append([label, val_str])
        kpi_table = Table(kpi_rows, colWidths=[12*cm, 5*cm])
        kpi_table.setStyle(TableStyle([
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('BACKGROUND', (0,0), (-1,0), HexColor("#0f172a")),
            ('TEXTCOLOR', (0,0), (-1,0), white),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [HexColor("#f8fafc"), white]),
            ('GRID', (0,0), (-1,-1), 0.5, HexColor("#e2e8f0")),
            ('ALIGN', (1,0), (-1,-1), 'RIGHT'),
            ('PADDING', (0,0), (-1,-1), 5),
            ('FONTSIZE', (0,0), (-1,-1), 9),
        ]))
        story.append(kpi_table)
        story.append(Spacer(1, 0.4*cm))

    # ── PLAN D'AMÉLIORATION ───────────────────────────────────────────────
    if score.ai_improvement_plan:
        story.append(Paragraph("<b>🤖 Plan d'amélioration recommandé</b>",
                               ParagraphStyle('ai', fontSize=11, textColor=DARK,
                                              fontName='Helvetica-Bold', spaceAfter=4)))
        story.append(Paragraph(score.ai_improvement_plan,
                               ParagraphStyle('ai_body', fontSize=10, textColor=GRAY,
                                              backColor=HexColor("#f8fafc"),
                                              borderColor=ORANGE, borderWidth=1,
                                              borderPadding=6, spaceAfter=8)))

    # ── BONUS ─────────────────────────────────────────────────────────────
    if score.bonus_amount and score.bonus_amount > 0:
        story.append(Paragraph(
            f"<b>💰 Bonus calculé : {score.bonus_amount:,.0f} FCFA</b>",
            ParagraphStyle('bonus', fontSize=12, textColor=GREEN, fontName='Helvetica-Bold',
                           alignment=TA_CENTER, spaceBefore=8)))

    # ── FOOTER ────────────────────────────────────────────────────────────
    story.append(Spacer(1, 1*cm))
    story.append(HRFlowable(width="100%", thickness=1, color=HexColor("#e2e8f0")))
    story.append(Paragraph(
        f"Rapport généré le {datetime.utcnow().strftime('%d/%m/%Y à %H:%M')} — Confidentiel — FAROUK DISTRIBUTION",
        ParagraphStyle('footer', fontSize=8, textColor=GRAY, alignment=TA_CENTER, spaceBefore=4)))

    doc.build(story)
    buf.seek(0)
    return buf.getvalue()


def _generate_text_fallback(campaign, score, agent_name: str, role: str) -> bytes:
    """Fallback texte si reportlab absent."""
    content = f"""
FAROUK DISTRIBUTION — Réseau Orange Mali
=======================================
RAPPORT D'ÉVALUATION — {role}
Période : {campaign.period_key}

Agent : {agent_name}
Rôle  : {role}
Date  : {datetime.utcnow().strftime('%d/%m/%Y %H:%M')}

SCORE FINAL : {score.score_final or 0}/100 — {score.score_label or '—'}

Scores par dimension :
  - KPI automatiques    : {score.score_kpi or 0:.1f}/100
  - Appels mystères     : {score.score_mystery or 0:.1f}/100
  - Notes manuelles     : {score.score_manual or 0:.1f}/100

KPI Détails : {score.kpi_data or {}}

Plan d'amélioration :
{score.ai_improvement_plan or 'Non disponible'}

Bonus calculé : {score.bonus_amount or 0:,.0f} FCFA

---
Confidentiel — FAROUK DISTRIBUTION
    """.encode("utf-8")
    return content
