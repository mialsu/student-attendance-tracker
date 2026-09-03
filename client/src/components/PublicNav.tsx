import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

const PublicNav = () => {
  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-lg font-semibold hover:text-primary transition-colors">
          <Home className="w-5 h-5" />
          <span>Läsnäolojen kirjaus</span>
        </Link>
      </div>
    </header>
  );
};

export default PublicNav;
