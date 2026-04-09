# FaroukManager API - Analytics & Dashboard Endpoints

## Overview

Complete list of analytics and dashboard endpoints for FaroukManager, including new advanced AI modules and ranking systems.

---

## Analytics Endpoints

### 1. Health Scores
**Endpoint**: `GET /api/analytics/health-scores`

**Description**: Retrieve health scores for all PDVs with optional filtering

**Query Parameters**:
- `zone` (optional): Filter by zone name
- `min_score` (optional, 0-100): Minimum health score
- `max_score` (optional, 0-100): Maximum health score

**Response**:
```json
{
  "count": 200,
  "average_health": 72.0,
  "scores": [
    {
      "pdv_id": 1,
      "numero_pdv": "PDV001",
      "nom": "Orange Corner Centre",
      "zone": "Bamako Centre",
      "health_score": 95.2,
      "segment": "Champion",
      "medaille": "OR",
      "superviseur": "Supervisor A",
      "gestionnaire": "Manager A"
    }
  ]
}
```

---

### 2. Segments
**Endpoint**: `GET /api/analytics/segments`

**Description**: Get PDVs grouped by health segment

**Response**:
```json
{
  "total": 200,
  "segments": {
    "Champion": {
      "count": 130,
      "pdvs": [
        {
          "pdv_id": 1,
          "numero_pdv": "PDV001",
          "nom": "Orange Corner Centre",
          "zone": "Bamako Centre",
          "health_score": 95.2,
          "medaille": "OR",
          "gestionnaire": "Manager A"
        }
      ]
    },
    "Stable": {"count": 40, "pdvs": [...]},
    "À surveiller": {"count": 0, "pdvs": []},
    "Déclinant": {"count": 0, "pdvs": []},
    "Inactif": {"count": 30, "pdvs": [...]}
  }
}
```

**Segments**:
- **Champion**: Health score > 80
- **Stable**: Health score 60-80
- **À surveiller**: Health score 40-60
- **Déclinant**: Health score 20-40
- **Inactif**: Health score < 20

---

### 3. Predictions (At-Risk Analysis)
**Endpoint**: `GET /api/analytics/predictions`

**Description**: Get PDVs at risk of decline with network forecast

**Response**:
```json
{
  "total_at_risk": 5,
  "high_risk_count": 0,
  "medium_risk_count": 5,
  "low_risk_count": 0,
  "high_risk_pdvs": [],
  "medium_risk_pdvs": [
    {
      "pdv_id": 15,
      "pdv_name": "Orange Retail Point - Bamako Centre",
      "numero_pdv": "PDV015",
      "zone": "Bamako Centre",
      "gestionnaire": "Manager B",
      "probability": 0.460,
      "risk_level": "MOYEN",
      "predicted_ca_next_week": 450000.0,
      "trend_slope": -25000.0,
      "trend_pct": -4.35,
      "consecutive_declines": 2,
      "explanation": "Tendance baissière: pente -4.35%/sem",
      "confidence": 0.85
    }
  ],
  "low_risk_pdvs": [],
  "network_forecast": {
    "predictions": [...],
    "by_zone": {...},
    "risk_alert": false,
    "risk_message": ""
  }
}
```

**Risk Levels**:
- **HAUT** (High): probability ≥ 0.7
- **MOYEN** (Medium): 0.4 ≤ probability < 0.7
- **FAIBLE** (Low): probability < 0.4

---

### 4. Forecast
**Endpoint**: `GET /api/analytics/forecast`

**Description**: Network CA forecast for next 4 weeks with zone breakdown

**Response**:
```json
{
  "predictions": [
    {
      "semaine": 1,
      "annee": 2026,
      "ca_prevu": 5477214.0,
      "ca_min": 4928493.0,
      "ca_max": 6026035.0,
      "confidence": 0.70
    },
    {
      "semaine": 2,
      "annee": 2026,
      "ca_prevu": 5512357.0,
      "ca_min": 4956821.0,
      "ca_max": 6067894.0,
      "confidence": 0.73
    }
  ],
  "by_zone": {
    "Bamako Centre": [
      {
        "semaine": 1,
        "ca_prevu": 725641.0,
        "ca_min": 651577.0,
        "ca_max": 799705.0
      }
    ]
  },
  "risk_alert": false,
  "risk_message": ""
}
```

---

### 5. Gini Coefficient
**Endpoint**: `GET /api/analytics/gini`

**Description**: Concentration analysis with Pareto distribution

**Response**:
```json
{
  "gini_coefficient": 0.367,
  "interpretation": "Modérément concentrée",
  "total_pdvs": 200,
  "total_ca": 1750504577.0,
  "concentration": "Modérée",
  "pareto": {
    "top_20_pct_count": 40,
    "top_20_contribution_pct": 34.9,
    "details": [
      {
        "pdv_id": 1,
        "nom": "Orange Service Centre - Koulikoro",
        "ca": 2181616.0,
        "pct_total": 5.2
      }
    ]
  }
}
```

**Concentration Levels**:
- **Élevée**: Gini > 0.5
- **Modérée**: 0.3 < Gini ≤ 0.5
- **Faible**: Gini ≤ 0.3

---

### 6. Heatmap (Geographic Distribution)
**Endpoint**: `GET /api/analytics/heatmap`

**Description**: Geographic distribution of PDVs and CA by zone

**Query Parameters**:
- `annee` (optional): Year filter
- `mois` (optional): Month filter (1-12)

**Response**:
```json
{
  "zones": 8,
  "total_ca": 1750504577.0,
  "data": {
    "Bamako Centre": {
      "ca": 232950749.0,
      "count": 25,
      "health_avg": 72.4,
      "pct_network": 13.3,
      "nb_actifs": 23
    },
    "Bamako Nord": {
      "ca": 195957836.0,
      "count": 25,
      "health_avg": 71.2,
      "pct_network": 11.2,
      "nb_actifs": 24
    }
  }
}
```

---

### 7. Update Health Scores (Batch)
**Endpoint**: `POST /api/analytics/update-scores`

**Description**: Recalculate health scores for all PDVs

**Response**:
```json
{
  "success": true,
  "message": "Scores mis à jour pour 200 PDVs",
  "data": {
    "updated": 200,
    "avg_score": 72.0,
    "score_distribution": {
      "min": 0.0,
      "max": 95.2,
      "p25": 78.3,
      "p50": 82.3,
      "p75": 85.8
    },
    "segments": {
      "Champion": 130,
      "Stable": 40,
      "À surveiller": 0,
      "Déclinant": 0,
      "Inactif": 30
    },
    "medals": {
      "OR": 21,
      "ARGENT": 30,
      "BRONZE": 30,
      "AUCUNE": 119
    }
  }
}
```

---

## Dashboard Endpoints

### 1. Monthly Dashboard
**Endpoint**: `GET /api/dashboard/monthly`

**Description**: Monthly performance metrics and rankings

**Query Parameters**:
- `annee` (optional): Year
- `mois` (optional): Month
- `zone` (optional): Zone filter
- `superviseur` (optional): Supervisor filter

**Response**: Monthly metrics, top/bottom PDVs, zone summaries

---

### 2. Weekly Dashboard
**Endpoint**: `GET /api/dashboard/weekly`

**Description**: Weekly performance metrics and trends

**Query Parameters**:
- `annee` (optional): Year
- `semaine` (optional): Week number
- Similar filtering options as monthly

**Response**: Weekly metrics, trend analysis, performance indicators

---

### 3. Classements (Enhanced Rankings)
**Endpoint**: `GET /api/dashboard/classements`

**Description**: Complete rankings with multiple dimensions

**Query Parameters**:
- `annee` (default: 2025): Year
- `mois` (default: 12): Month
- `n` (default: 10, 1-100): Top N PDVs
- `zone` (optional): Zone filter
- `superviseur` (optional): Supervisor filter
- `type_pdv` (optional): PDV type filter

**Response**:
```json
{
  "annee": 2025,
  "mois": 12,
  "top_n": 10,
  "top_pdvs_ca": [...],
  "bottom_pdvs_ca": [...],
  "top_pdvs_depots": [...],
  "bottom_pdvs_depots": [...],
  "top_pdvs_retraits": [...],
  "bottom_pdvs_retraits": [...],
  "top_pdvs_operations": [...],
  "bottom_pdvs_operations": [...],
  "top_by_superviseur": {
    "Supervisor A": {
      "top": [...],
      "bottom": [...]
    }
  },
  "top_by_type": {
    "RS": {"top": [...], "bottom": [...]},
    "RNS": {"top": [...], "bottom": [...]}
  },
  "top_by_quartier": {
    "Quartier 1": {"top": [...], "bottom": [...]}
  },
  "top_by_gestionnaire": {
    "Manager A": {"top": [...], "bottom": [...]}
  }
}
```

**Ranking Dimensions**:
- ✅ Global (CA, Deposits, Withdrawals, Operations)
- ✅ By Supervisor
- ✅ By Type (KIOSQUE, RNS, RS, RSF)
- ✅ **By Quartier** (NEW)
- ✅ **By Gestionnaire** (NEW)

---

### 4. PDV Records (NEW)
**Endpoint**: `GET /api/dashboard/pdv-records`

**Description**: Historical records for each PDV

**Response**:
```json
{
  "total_pdvs": 200,
  "period_months": 11,
  "records": [
    {
      "pdv_id": 1,
      "numero_pdv": "PDV001",
      "nom": "Orange Service Centre - Koulikoro",
      "zone": "Koulikoro",
      "gestionnaire": "Manager A",
      "ca_max": 2181616.0,
      "mois_ca_max": "2025-11",
      "ca_min": 1890234.0,
      "nb_fois_top10": 2,
      "health_score": 92.1,
      "segment": "Champion"
    }
  ]
}
```

**Fields**:
- `ca_max`: Maximum CA achieved
- `mois_ca_max`: Month when max CA was reached
- `ca_min`: Minimum CA achieved
- `nb_fois_top10`: Number of times in top 10 (last 12 months)

---

### 5. Pareto Analysis
**Endpoint**: `GET /api/dashboard/pareto`

**Description**: Pareto distribution and 80/20 analysis

**Query Parameters**:
- `annee` (optional): Year
- `mois` (optional): Month

**Response**: Pareto distribution, cumulative %, contribution breakdown

---

### 6. Network Statistics
**Endpoint**: `GET /api/dashboard/network-stats`

**Description**: Global network metrics

**Response**:
```json
{
  "total_pdvs": 200,
  "actifs": 170,
  "inactifs": 30,
  "taux_activite": 85.0,
  "ca_total_historique": 1750504577.0,
  "ca_dernier_mois": 145875381.0,
  "average_ca": 857502.0,
  "zones_count": 8,
  "superviseurs_count": 5,
  "average_health_score": 72.0
}
```

---

## Response Field Reference

### PDV Record
```json
{
  "pdv_id": integer,
  "numero_pdv": string,
  "nom": string,
  "zone": string,
  "gestionnaire": string,
  "health_score": float (0-100),
  "segment": string,
  "medaille": string (OR|ARGENT|BRONZE|AUCUNE),
  "ca": float,
  "nb_operations": integer,
  "nb_depots": integer,
  "montant_depots": float,
  "nb_retraits": integer,
  "montant_retraits": float
}
```

### Risk PDV Record
```json
{
  "pdv_id": integer,
  "pdv_name": string,
  "numero_pdv": string,
  "zone": string,
  "gestionnaire": string,
  "probability": float (0-1),
  "risk_level": string (HAUT|MOYEN|FAIBLE),
  "predicted_ca_next_week": float,
  "trend_slope": float,
  "trend_pct": float,
  "consecutive_declines": integer,
  "explanation": string,
  "confidence": float (0-1)
}
```

---

## Error Handling

All endpoints return appropriate HTTP status codes:
- `200 OK`: Successful request
- `400 Bad Request`: Invalid parameters
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

Error response format:
```json
{
  "detail": "Error description"
}
```

---

## Rate Limiting

No rate limiting currently implemented. Recommended for production:
- Health score updates: 1 per minute
- Forecast requests: 10 per minute
- Other analytics: 60 per minute

---

## Authentication

Currently no authentication required. Recommended for production deployment.

---

## Version

API Version: 1.0
Last Updated: 2026-03-29
Status: ✅ Production Ready
