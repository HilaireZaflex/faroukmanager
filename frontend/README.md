# FaroukManager Frontend

React 18 frontend application for Orange Mali's POS Management System.

## Setup Instructions

### Installation

```bash
cd /Users/nms/FaroukManager/frontend
npm install
```

### Development Server

```bash
npm start
```

The application will start on `http://localhost:3000`

### Build for Production

```bash
npm build
```

## Project Structure

```
frontend/
├── public/
│   └── index.html                 # Main HTML template
├── src/
│   ├── App.js                     # Main router and app setup
│   ├── index.js                   # React 18 entry point with QueryClient
│   ├── components/
│   │   ├── common/                # Reusable UI components
│   │   ├── dashboard/             # Dashboard-specific components
│   │   ├── pdv/                   # PDV management components
│   │   ├── alerts/                # Alert components
│   │   ├── recovery/              # Recovery action components
│   │   ├── analytics/             # Analytics components
│   │   ├── auth/                  # Authentication components
│   │   └── layout/
│   │       ├── Layout.js          # Main layout wrapper
│   │       ├── Sidebar.js         # Navigation sidebar
│   │       ├── Header.js          # Top header/navbar
│   │       ├── Layout.css
│   │       ├── Sidebar.css
│   │       └── Header.css
│   ├── pages/
│   │   ├── LoginPage.js           # Login page
│   │   ├── DashboardPage.js       # Monthly dashboard
│   │   ├── WeeklyDashboardPage.js # Weekly dashboard
│   │   ├── PDVsPage.js            # PDV list management
│   │   ├── PDVDetailPage.js       # PDV detail view
│   │   ├── AlertsPage.js          # Alerts dashboard
│   │   ├── AnalyticsPage.js       # Advanced analytics
│   │   ├── RecoveryPage.js        # Recovery actions
│   │   ├── ReportsPage.js         # Reports generation
│   │   └── SettingsPage.js        # Application settings
│   ├── services/
│   │   ├── api.js                 # Axios instance with interceptors
│   │   ├── pdvService.js          # PDV API calls
│   │   ├── dashboardService.js    # Dashboard API calls
│   │   └── alertService.js        # Alert API calls
│   ├── store/
│   │   └── authStore.js           # Zustand auth store
│   ├── hooks/                     # Custom React hooks
│   ├── utils/                     # Utility functions
│   └── styles/
│       ├── index.css              # Global styles with CSS variables
│       └── pages/
│           └── LoginPage.css      # Page-specific styles
├── package.json                   # Dependencies and scripts
└── README.md                      # This file
```

## Key Technologies

- **React 18**: UI library with modern hooks
- **React Router v6**: Client-side routing
- **Zustand**: Lightweight state management for auth
- **React Query**: Server state management with caching
- **Axios**: HTTP client with interceptors
- **Recharts**: Data visualization
- **Lucide React**: Icon library
- **date-fns**: Date manipulation
- **XLSX**: Excel file handling

## Authentication

Authentication is handled via Zustand store (`src/store/authStore.js`):

- Login credentials are stored in browser localStorage
- JWT tokens are automatically added to API requests via interceptors
- 401 responses trigger automatic logout and redirect to login
- Protected routes check authentication status before rendering

### Login Flow

```
LoginPage -> API Call -> useAuthStore.login() -> Redirect to /dashboard
```

## API Integration

All API calls go through `src/services/api.js` which:

1. Sets base URL to `http://localhost:8000/api`
2. Automatically adds JWT token from auth store
3. Handles 401 errors with automatic logout
4. Can be configured via `REACT_APP_API_BASE_URL` environment variable

### Service Methods

#### pdvService
- `getPDVs(filters)` - Get all PDVs
- `getPDV(id)` - Get single PDV
- `createPDV(data)` - Create new PDV
- `updatePDV(id, data)` - Update PDV
- `deletePDV(id)` - Delete PDV
- `importPDVs(file)` - Import from file
- `exportPDVs(filters)` - Export to file
- `getPDVStats()` - Get statistics

#### dashboardService
- `getMonthlyDashboard(params)` - Monthly analytics
- `getWeeklyDashboard(params)` - Weekly analytics
- `getParetoAnalysis(params)` - Pareto analysis
- `getClassements(params)` - Rankings
- `getNetworkStats()` - Network statistics

#### alertService
- `getInactivePDVs(params)` - Inactive devices
- `getDecliningPDVs(params)` - Declining performance
- `getRecoveryList(params)` - Recovery candidates
- `createAction(data)` - Create recovery action
- `getActions(pdvId, params)` - Get PDV actions

## Styling

### CSS Variables (Orange Mali Brand)

```css
--primary: #FF6900 (Orange)
--secondary: #1a1a2e (Dark)
--success: #00b894 (Green)
--danger: #e17055 (Red)
--warning: #fdcb6e (Yellow)
--info: #0984e3 (Blue)
```

### Layout

- **Sidebar**: Fixed left navigation (250px on desktop, responsive on mobile)
- **Header**: Fixed top bar with user menu (70px height)
- **Main Content**: Flexible grid layout with responsive columns

### Responsive Breakpoints

- Desktop: Full layout (1024px+)
- Tablet: Sidebar collapse (768px - 1023px)
- Mobile: Hamburger menu (< 768px)

## Usage Examples

### Using the Auth Store

```javascript
import useAuthStore from '../store/authStore';

function MyComponent() {
  const { user, isAuthenticated, logout } = useAuthStore();
  
  return (
    <div>
      {isAuthenticated && <p>Welcome, {user.name}</p>}
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Making API Calls with React Query

```javascript
import { useQuery } from 'react-query';
import pdvService from '../services/pdvService';

function PDVList() {
  const { data, isLoading, error } = useQuery(
    'pdvs',
    () => pdvService.getPDVs(),
    { staleTime: 5 * 60 * 1000 }
  );

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <ul>{data.map(pdv => <li key={pdv.id}>{pdv.name}</li>)}</ul>;
}
```

## Environment Variables

Create a `.env` file in the frontend directory:

```
REACT_APP_API_BASE_URL=http://localhost:8000/api
```

## Common Commands

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm build

# Run tests
npm test
```

## Features

✅ Authentication with JWT tokens
✅ Protected routes with automatic redirects
✅ Responsive sidebar navigation
✅ Global CSS variables with Orange Mali branding
✅ Automatic API token injection
✅ 401 error handling with logout
✅ React Query for efficient server state
✅ Zustand for lightweight client state
✅ Complete styling for all major components
✅ Mobile-responsive design
✅ Dark theme support ready

## Notes

- All API calls include JWT authentication
- localStorage persists auth state across sessions
- CSS uses custom properties for easy theming
- Components are modular and reusable
- Layout adapts to mobile/tablet/desktop screens

## Next Steps

1. Install dependencies: `npm install`
2. Configure backend API URL in `.env`
3. Update page components with actual content
4. Add custom components in respective directories
5. Connect services to backend endpoints
6. Add form validation and error handling
7. Implement additional features as needed
