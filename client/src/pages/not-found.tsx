import { Link } from "wouter";
import { Button } from "@/components/ui/button-animated";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-2 border-border/50 shadow-2xl">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 text-destructive font-bold items-center text-xl">
            <AlertCircle className="w-8 h-8" />
            404 Page Not Found
          </div>
          
          <p className="mt-4 text-muted-foreground text-sm">
            We couldn't find the page you were looking for. It might have been removed or the link might be broken.
          </p>

          <div className="mt-6">
            <Link href="/" className="w-full">
              <Button className="w-full">
                Return to Home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
