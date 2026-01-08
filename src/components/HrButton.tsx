import { Button } from "@/components/ui/button";
import { Users2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useIsHR } from "@/hooks/useIsHR";

export default function HrButton() {
  const navigate = useNavigate();
  const { data: canHR, isLoading } = useIsHR();

  if (isLoading || !canHR) return null;

  return (
    <Button
      variant="secondary"
      size="sm"
      className="gap-2"
      onClick={() => navigate("/rh/funcionarios")}
    >
      <Users2 className="h-4 w-4" />
      Gerenciar funcionários
    </Button>
  );
}
