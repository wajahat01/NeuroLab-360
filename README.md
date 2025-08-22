# NeuroLab 360

A full-stack web application for conducting mock neurological experiments and visualizing experimental data.

## Tech Stack

- **Frontend**: React + TailwindCSS
- **Backend**: Flask (Python API)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth

## Project Structure

```
root/
├── backend/
│   ├── app.py                 # Flask entrypoint
│   ├── routes/
│   │   ├── experiments.py     # APIs to run mock experiments & store results
│   │   └── dashboard.py       # APIs to fetch data for visualization
│   ├── supabase_client.py     # Supabase connection helper
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   └── Experiments.jsx
│   │   └── components/
│   │       ├── Navbar.jsx
│   │       ├── ExperimentCard.jsx
│   │       └── DataChart.jsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── .env
├── supabase/
│   └── schema.sql             # Table definitions
├── .env.example               # Environment variables template
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- Python (v3.8 or higher)
- Supabase account and project

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. The `.env` file is already configured with your Supabase credentials.

5. Run the Flask application:
   ```bash
   python app.py
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. The `.env` file is already configured with your Supabase credentials.

4. Start the React development server:
   ```bash
   npm start
   ```

### Database Setup

1. Navigate to your Supabase project dashboard: https://fdkjoykhsdwigwjtxdxa.supabase.co
2. Go to the SQL Editor
3. Run the schema.sql file to create the necessary tables

## Development

- Backend runs on `http://localhost:5000`
- Frontend runs on `http://localhost:3000`
- Database is hosted on Supabase

## Features

- User authentication with email/password
- Interactive dashboard with experiment visualizations
- Mock experiment execution and data storage
- Responsive design for all device sizes
- Real-time data updates

## Contributing

1. Follow the implementation tasks in `.kiro/specs/neurolab-360/tasks.md`
2. Ensure all tests pass before submitting changes
3. Follow the established code style and patterns