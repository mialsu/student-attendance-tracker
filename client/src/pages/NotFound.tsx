import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    // `Link`, not `<a href>`: this is the one route in the app that reached for a full page
    // reload. `/` is `Index`, which redirects by session, so the destination is right for a
    // signed-out visitor as well — which is why the label says "alkuun" and not "kursseihin".
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-3xl font-bold text-heading">Sivua ei löytynyt</h1>
        <p className="text-muted-foreground">Tarkista osoite tai palaa alkuun.</p>
        <Link
          to="/"
          className="inline-block text-primary underline underline-offset-4 hover:text-primary/80"
        >
          Palaa alkuun
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
