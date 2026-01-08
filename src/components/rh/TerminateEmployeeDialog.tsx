import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { terminateEmployee, Employee } from "@/lib/employeeService";

export default function TerminateEmployeeDialog(props: {
  employee: Employee | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { employee, onClose, onSuccess } = props;
  const [date, setDate] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  if (!employee) return null;

  async function handleTerminate() {
    const when = date || new Date().toISOString().slice(0, 10);
    await terminateEmployee(employee.id!, when, reason);
    onSuccess?.();
  }

  return (
    <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Desligar funcionário</DialogTitle>
          <DialogDescription>
            Confirme a data de desligamento e, se quiser, um motivo breve.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Funcionário</Label>
            <div className="mt-1 text-sm">{employee.full_name} — {employee.cpf}</div>
          </div>
          <div>
            <Label>Data de desligamento</Label>
            <Input type="date" value={date} onChange={(e)=>setDate(e.target.value)} />
          </div>
          <div>
            <Label>Motivo (opcional)</Label>
            <Input value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Ex.: término de contrato" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={handleTerminate}>Confirmar desligamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
