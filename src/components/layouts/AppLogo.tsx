import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

export function AppLogo() {
  return (
    <Link
      to="/dashboard"
      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
    >
      <BookOpen className="w-5 h-5 text-primary" />
      <span className="font-semibold text-base hidden sm:inline">Läsnäolot</span>
    </Link>
  );
}
