import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const getNavLinks = () => {
    if (!user) return [];
    
    const baseLinks = [
      { path: '/', label: 'Dashboard', roles: ['manager', 'accountant', 'director'] },
    ];

    if (user.role === 'manager') {
      return [
        ...baseLinks,
        { path: '/deals/new', label: 'New Deal', roles: ['manager'] },
      ];
    }

    if (user.role === 'accountant') {
      return [
        ...baseLinks,
        { path: '/accountant', label: 'Calculation Queue', roles: ['accountant'] },
      ];
    }

    if (user.role === 'director') {
      return [
        ...baseLinks,
        { path: '/director', label: 'Approvals', roles: ['director'] },
        { path: '/director/dashboard', label: 'Dashboard', roles: ['director'] },
      ];
    }

    return baseLinks;
  };

  const navLinks = getNavLinks();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">Deal Processing</h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                      location.pathname === link.path
                        ? 'border-indigo-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-gray-700 mr-4">
                {user?.full_name || user?.email} ({user?.role})
              </span>
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

