import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background"
      dir="rtl"
    >
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <h2 className="text-2xl font-semibold">الصفحة مش موجودة</h2>
        <p className="text-muted-foreground">
          الصفحة اللي بتدور عليها مش موجودة أو اتنقلت لمكان تاني.
        </p>
        <Button asChild>
          <Link to="/dashboard">
            <Home className="w-4 h-4 ml-2" />
            الرجوع للرئيسية
          </Link>
        </Button>
      </div>
    </div>
  );
}
