# NeuroLab 360 API Documentation

## Overview

The NeuroLab 360 API is a RESTful service built with Flask that provides endpoints for managing neurological experiments and dashboard data. All endpoints require authentication via Supabase Auth JWT tokens.

## Base URL

- **Development**: `http://localhost:5000/api`
- **Production**: `https://your-production-domain.com/api`
- **Supabase Direct**: `https://fdkjoykhsdwigwjtxdxa.supabase.co/rest/v1/`

## Authentication

All API endpoints require authentication. Include the JWT token in the Authorization header:

```http
Authorization: Bearer <your-jwt-token>
```

The token is obtained through Supabase Auth and automatically handled by the frontend application.

## Response Format

All API responses follow a consistent JSON format:

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error description",
  "code": "ERROR_CODE"
}
```

## Experiments API

### Create and Run Experiment

Creates a new experiment and executes it with mock data generation.

**Endpoint:** `POST /api/experiments`

**Request Body:**
```json
{
  "name": "EEG Alpha Wave Study",
  "experiment_type": "eeg_recording",
  "parameters": {
    "duration": 300,
    "sampling_rate": 256,
    "channels": ["Fp1", "Fp2", "C3", "C4"],
    "stimulus_type": "visual"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "experiment": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "user_id": "user-uuid",
      "name": "EEG Alpha Wave Study",
      "experiment_type": "eeg_recording",
      "parameters": {
        "duration": 300,
        "sampling_rate": 256,
        "channels": ["Fp1", "Fp2", "C3", "C4"],
        "stimulus_type": "visual"
      },
      "status": "completed",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:35:00Z"
    },
    "results": {
      "id": "result-uuid",
      "experiment_id": "123e4567-e89b-12d3-a456-426614174000",
      "data_points": [
        {
          "timestamp": 0,
          "channel": "Fp1",
          "value": 12.5,
          "metadata": {
            "frequency_band": "alpha",
            "artifact_detected": false
          }
        }
      ],
      "metrics": {
        "mean_amplitude": 15.2,
        "std_dev": 3.8,
        "peak_frequency": 10.5,
        "signal_quality": 0.92
      },
      "analysis_summary": "Strong alpha wave activity detected during eyes-closed condition.",
      "created_at": "2024-01-15T10:35:00Z"
    }
  },
  "message": "Experiment created and executed successfully"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid parameters or missing required fields
- `401 Unauthorized`: Invalid or missing authentication token
- `500 Internal Server Error`: Server error during experiment execution

### Get User's Experiments

Retrieves all experiments for the authenticated user with optional filtering and pagination.

**Endpoint:** `GET /api/experiments`

**Query Parameters:**
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Number of results per page (default: 20, max: 100)
- `experiment_type` (optional): Filter by experiment type
- `status` (optional): Filter by experiment status
- `sort` (optional): Sort field (created_at, name, status)
- `order` (optional): Sort order (asc, desc)

**Example Request:**
```http
GET /api/experiments?page=1&limit=10&experiment_type=eeg_recording&sort=created_at&order=desc
```

**Response:**
```json
{
  "success": true,
  "data": {
    "experiments": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "name": "EEG Alpha Wave Study",
        "experiment_type": "eeg_recording",
        "status": "completed",
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T10:35:00Z",
        "results_count": 1
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "pages": 3,
      "has_next": true,
      "has_prev": false
    }
  },
  "message": "Experiments retrieved successfully"
}
```

### Get Specific Experiment

Retrieves detailed information about a specific experiment including its results.

**Endpoint:** `GET /api/experiments/<experiment_id>`

**Response:**
```json
{
  "success": true,
  "data": {
    "experiment": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "user_id": "user-uuid",
      "name": "EEG Alpha Wave Study",
      "experiment_type": "eeg_recording",
      "parameters": {
        "duration": 300,
        "sampling_rate": 256,
        "channels": ["Fp1", "Fp2", "C3", "C4"],
        "stimulus_type": "visual"
      },
      "status": "completed",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:35:00Z"
    },
    "results": [
      {
        "id": "result-uuid",
        "data_points": [...],
        "metrics": {...},
        "analysis_summary": "...",
        "created_at": "2024-01-15T10:35:00Z"
      }
    ]
  },
  "message": "Experiment details retrieved successfully"
}
```

**Error Responses:**
- `404 Not Found`: Experiment not found or not accessible by user
- `401 Unauthorized`: Invalid or missing authentication token

### Delete Experiment

Deletes an experiment and all associated results.

**Endpoint:** `DELETE /api/experiments/<experiment_id>`

**Response:**
```json
{
  "success": true,
  "data": {
    "deleted_experiment_id": "123e4567-e89b-12d3-a456-426614174000"
  },
  "message": "Experiment deleted successfully"
}
```

**Error Responses:**
- `404 Not Found`: Experiment not found or not accessible by user
- `401 Unauthorized`: Invalid or missing authentication token
- `409 Conflict`: Cannot delete experiment in running status

## Dashboard API

### Get Dashboard Summary

Retrieves summary statistics for the user's experiments.

**Endpoint:** `GET /api/dashboard/summary`

**Response:**
```json
{
  "success": true,
  "data": {
    "total_experiments": 25,
    "completed_experiments": 23,
    "running_experiments": 1,
    "failed_experiments": 1,
    "total_data_points": 125000,
    "average_experiment_duration": 285.5,
    "most_common_experiment_type": "eeg_recording",
    "recent_activity": {
      "last_experiment_date": "2024-01-15T10:30:00Z",
      "experiments_this_week": 5,
      "experiments_this_month": 18
    }
  },
  "message": "Dashboard summary retrieved successfully"
}
```

### Get Chart Data

Retrieves data formatted for dashboard visualizations.

**Endpoint:** `GET /api/dashboard/charts`

**Query Parameters:**
- `chart_type` (optional): Specific chart type (timeline, distribution, performance)
- `date_range` (optional): Date range filter (7d, 30d, 90d, 1y)

**Response:**
```json
{
  "success": true,
  "data": {
    "timeline_chart": {
      "labels": ["2024-01-01", "2024-01-02", "2024-01-03"],
      "datasets": [
        {
          "label": "Experiments per Day",
          "data": [2, 1, 3],
          "backgroundColor": "#3B82F6"
        }
      ]
    },
    "experiment_type_distribution": {
      "labels": ["EEG Recording", "fMRI Scan", "Behavioral Test"],
      "datasets": [
        {
          "data": [15, 8, 2],
          "backgroundColor": ["#3B82F6", "#10B981", "#F59E0B"]
        }
      ]
    },
    "performance_metrics": {
      "labels": ["Signal Quality", "Data Completeness", "Processing Speed"],
      "datasets": [
        {
          "data": [92, 98, 85],
          "backgroundColor": "#8B5CF6"
        }
      ]
    }
  },
  "message": "Chart data retrieved successfully"
}
```

### Get Recent Experiments

Retrieves the most recent experiment results for dashboard display.

**Endpoint:** `GET /api/dashboard/recent`

**Query Parameters:**
- `limit` (optional): Number of recent experiments to return (default: 5, max: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "recent_experiments": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "name": "EEG Alpha Wave Study",
        "experiment_type": "eeg_recording",
        "status": "completed",
        "created_at": "2024-01-15T10:30:00Z",
        "key_metrics": {
          "duration": 300,
          "data_points": 5000,
          "quality_score": 0.92
        }
      }
    ]
  },
  "message": "Recent experiments retrieved successfully"
}
```

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_REQUEST` | Request body or parameters are invalid |
| `UNAUTHORIZED` | Authentication token is missing or invalid |
| `FORBIDDEN` | User doesn't have permission to access resource |
| `NOT_FOUND` | Requested resource doesn't exist |
| `CONFLICT` | Request conflicts with current resource state |
| `VALIDATION_ERROR` | Input validation failed |
| `DATABASE_ERROR` | Database operation failed |
| `EXPERIMENT_ERROR` | Error during experiment execution |
| `INTERNAL_ERROR` | Unexpected server error |

## Rate Limiting

API endpoints are rate-limited to prevent abuse:

- **General endpoints**: 100 requests per minute per user
- **Experiment creation**: 10 requests per minute per user
- **Dashboard endpoints**: 60 requests per minute per user

Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642248000
```

## Experiment Types

### Supported Experiment Types

1. **eeg_recording**
   - Parameters: `duration`, `sampling_rate`, `channels`, `stimulus_type`
   - Generates: EEG signal data with frequency analysis

2. **fmri_scan**
   - Parameters: `scan_duration`, `tr`, `voxel_size`, `task_paradigm`
   - Generates: BOLD signal data with activation maps

3. **behavioral_test**
   - Parameters: `test_type`, `trial_count`, `stimulus_set`
   - Generates: Reaction time and accuracy data

4. **emg_recording**
   - Parameters: `muscle_groups`, `contraction_type`, `duration`
   - Generates: Muscle activation patterns

## SDK and Client Libraries

### JavaScript/TypeScript Client

```javascript
import { NeuroLabAPI } from '@neurolab/api-client';

const api = new NeuroLabAPI({
  baseURL: 'http://localhost:5000',
  token: 'your-jwt-token'
});

// Create experiment
const experiment = await api.experiments.create({
  name: 'My EEG Study',
  experiment_type: 'eeg_recording',
  parameters: {
    duration: 300,
    sampling_rate: 256,
    channels: ['Fp1', 'Fp2']
  }
});
```

### Python Client

```python
from neurolab_client import NeuroLabAPI

api = NeuroLabAPI(
    base_url='http://localhost:5000',
    token='your-jwt-token'
)

# Create experiment
experiment = api.experiments.create(
    name='My EEG Study',
    experiment_type='eeg_recording',
    parameters={
        'duration': 300,
        'sampling_rate': 256,
        'channels': ['Fp1', 'Fp2']
    }
)
```

## Webhooks (Future Feature)

Webhook endpoints for real-time notifications:

- `experiment.created` - New experiment created
- `experiment.completed` - Experiment finished processing
- `experiment.failed` - Experiment execution failed
- `results.analyzed` - Analysis completed for experiment results

## API Versioning

The API uses URL versioning:
- Current version: `v1` (default)
- Future versions: `v2`, `v3`, etc.

Example: `GET /api/v1/experiments`

## Support

For API support and questions:
- Documentation: This file
- Issues: GitHub repository issues
- Email: support@neurolab360.com