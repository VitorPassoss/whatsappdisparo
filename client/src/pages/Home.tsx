import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading) {
      if (isAuthenticated) {
        navigate("/");
      } else {
        navigate("/login");
      }
    }
  }, [isAuthenticated, loading]);

  return null;
}
