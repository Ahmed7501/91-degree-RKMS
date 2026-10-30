import { Link } from 'react-router';
import { BrandMark } from '../components/ui/BrandMark';

export function NotFoundPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <BrandMark size="lg" />
        <h1 className="font-display text-3xl font-bold">Page not found</h1>
        <div className="flex gap-4 text-gold">
          <Link to="/owner" className="underline-offset-4 hover:underline">
            Owner panel
          </Link>
          <Link to="/kitchen" className="underline-offset-4 hover:underline">
            Kitchen display
          </Link>
        </div>
      </div>
    </main>
  );
}
