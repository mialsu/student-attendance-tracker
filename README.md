# Student Attendance Tracker

A modern, class-based attendance tracking system built for teachers to manage student attendance across multiple courses.

## Features

### Teacher Dashboard
- **Class Management**: Create and manage multiple classes (courses)
- **Attendance Tracking**: Mark student attendance with timestamp logging
- **Student Logs**: View detailed attendance history for each student per class
- **Account Settings**: Update email and password with secure validation

### Key Functionality
- **Teacher-only authentication** - Secure login for educators
- **Class-based organization** - Each course has its own attendance records
- **Two-tab interface per class**:
  - Attendance tracking tab - Quick student check-in
  - Student logs tab - Comprehensive attendance history
- **Finnish locale support** - All dates and text in Finnish
- **Responsive design** - Works seamlessly on desktop and mobile

## Technology Stack

This project is built with:

- **React 18** - Modern UI framework
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server
- **shadcn/ui** - Beautiful UI components built on Radix UI
- **Tailwind CSS** - Utility-first styling
- **React Router v6** - Client-side routing
- **TanStack Query** - Server state management
- **date-fns** - Date formatting with Finnish locale
- **Zod** - Schema validation

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or bun

### Installation

```sh
# Clone the repository
git clone <YOUR_GIT_URL>

# Navigate to the project directory
cd client-app

# Install dependencies
npm install

# Start the development server
npm run dev
```

The application will be available at `http://localhost:5173`

## Available Scripts

```sh
# Start development server
npm run dev

# Build for production
npm run build

# Build for development
npm run build:dev

# Preview production build
npm run preview

# Run linter
npm run lint
```

## Project Structure

```
client-app/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── ui/           # shadcn/ui components
│   │   ├── AttendanceTracking.tsx
│   │   ├── StudentLogs.tsx
│   │   └── PublicNav.tsx
│   ├── contexts/         # React contexts
│   │   └── AuthContext.tsx
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utilities and business logic
│   │   ├── classes.ts    # Class management functions
│   │   ├── attendance.ts # Legacy attendance functions
│   │   └── utils.ts      # Helper utilities
│   ├── pages/            # Route pages
│   │   ├── Auth.tsx      # Login/Signup page
│   │   ├── TeacherDashboard.tsx
│   │   ├── ClassView.tsx
│   │   ├── Settings.tsx
│   │   ├── Index.tsx
│   │   └── NotFound.tsx
│   ├── App.tsx           # Main app component
│   └── main.tsx          # Entry point
├── public/               # Static assets
└── Configuration files
```

## Routes

- `/` - Redirects to dashboard or auth
- `/auth` - Teacher login/signup
- `/dashboard` - Teacher dashboard with class list
- `/class/:classId` - Class view with attendance tracking
- `/settings` - Account settings (email/password)

## Data Storage

The application uses **API-based backend** for data persistence:
- JWT-based authentication with access and refresh tokens
- PostgreSQL database for all data storage
- FastAPI backend at: `https://attendance-api.kotoio.fi`
- Real-time data synchronization across devices

## Security

- Teacher-only authentication required
- Password minimum length: 8 characters
- Password verification required for account changes
- Email uniqueness validation

## Development

### Adding New UI Components

This project uses shadcn/ui components. To add new components:

```sh
npx shadcn-ui@latest add <component-name>
```

### Code Style

- ESLint configuration included
- TypeScript strict mode enabled
- React hooks linting enabled

## Production Deployment

The application is deployed to production:

- **Frontend**: https://app-attendance.kotoio.fi (Vercel)
- **Backend API**: https://attendance-api.kotoio.fi (Hetzner VM)
- **Database**: PostgreSQL 17 on Hetzner
- **SSL**: Let's Encrypt certificates
- **Domain**: kotoio.fi

### Deployment Architecture

- Frontend deployed to Vercel with automatic CI/CD from Git
- Backend deployed to Hetzner Cloud VM with Docker Compose
- HTTPS enabled on both frontend and backend
- CORS configured for cross-origin requests

## License

This project is private and proprietary.

## Support

For issues or questions, please contact the development team.
