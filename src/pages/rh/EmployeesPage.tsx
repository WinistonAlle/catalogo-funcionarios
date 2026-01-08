import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listEmployees, Employee } from "@/lib/employeeService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useIsHR } from "@/hooks/useIsHR";
import EmployeeFormDialog from "../../components/rh/EmployeeFormDialog";
import TerminateEmployeeDialog from "../../components/rh/TerminateEmployeeDialog";
import { toast } from "sonner";

type StatusFilter = "all" | "active" | "inactive" | "onboarding";

/** Debounce simples para evitar refetch a cada tecla */
function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function EmployeesPage() {
  const { data: canHR, isLoading: loadingPerm } = useIsHR();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const query = useQuery({
    queryKey: ["employees", { search: debouncedSearch, status, page, pageSize }],
    queryFn: () => listEmployees({ search: debouncedSearch, status, page, pageSize }),
    staleTime: 20_000,
    retry: 1,
  });

  useEffect(() => {
    if (query.isError) toast.error("Não foi possível carregar os funcionários.");
  }, [query.isError]);

  const [openCreate, setOpenCreate] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [terminateEmployee, setTerminateEmployee] = useState<Employee | null>(null);

  const total = query.data?.count ?? 0;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  if (loadingPerm) return <div className="p-6">Verificando permissões…</div>;
  if (!canHR) return <div className="p-6">Acesso restrito ao RH.</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Funcionários</h1>
        <Button onClick={() => setOpenCreate(true)}>Admitir Funcionário</Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-3 flex-col sm:flex-row">
            <Input
              placeholder="Buscar por nome ou CPF"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
            <Select
              value={status}
              onValueChange={(v) => {
                setPage(1);
                setStatus(v as StatusFilter);
              }}
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="onboarding">Onboarding</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg">
            <div className="grid grid-cols-12 text-sm font-medium p-3 border-b bg-muted/40">
              <div className="col-span-3">Nome</div>
              <div className="col-span-2">CPF</div>
              <div className="col-span-2">Departamento</div>
              <div className="col-span-2">Cargo</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-2 text-right">Ações</div>
            </div>

            {query.isLoading && (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-12 p-3 border-b animate-pulse">
                    <div className="col-span-3 h-4 bg-muted rounded" />
                    <div className="col-span-2 h-4 bg-muted rounded" />
                    <div className="col-span-2 h-4 bg-muted rounded" />
                    <div className="col-span-2 h-4 bg-muted rounded" />
                    <div className="col-span-1 h-4 bg-muted rounded" />
                    <div className="col-span-2 h-8 bg-muted rounded" />
                  </div>
                ))}
              </>
            )}

            {!query.isLoading && (query.data?.data?.length ?? 0) === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Nenhum funcionário encontrado.</div>
            )}

            {query.data?.data?.map((emp) => (
              <div key={emp.id} className="grid grid-cols-12 p-3 border-b last:border-b-0 items-center">
                <div className="col-span-3">{emp.full_name}</div>
                <div className="col-span-2">{emp.cpf}</div>
                <div className="col-span-2">{emp.department ?? "—"}</div>
                <div className="col-span-2">{emp.job_title ?? "—"}</div>
                <div className="col-span-1">
                  <span
                    className={[
                      "text-xs px-2 py-1 rounded-full border",
                      emp.status === "active" && "border-green-300 text-green-700 bg-green-50",
                      emp.status === "onboarding" && "border-amber-300 text-amber-700 bg-amber-50",
                      emp.status === "inactive" && "border-red-300 text-red-700 bg-red-50",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {emp.status}
                  </span>
                </div>
                <div className="col-span-2 flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setEditEmployee(emp)}>
                    Editar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={emp.status === "inactive"}
                    onClick={() => setTerminateEmployee(emp)}
                  >
                    Desligar
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-2 text-sm">
            <div>{total} registro(s)</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <div className="px-2 py-1 border rounded">
                {page} / {totalPages}
              </div>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <EmployeeFormDialog
        open={openCreate || !!editEmployee}
        onOpenChange={(o) => {
          if (!o) {
            setOpenCreate(false);
            setEditEmployee(null);
          }
        }}
        initial={editEmployee ?? undefined}
        onSuccess={() => {
          toast.success(editEmployee ? "Funcionário atualizado!" : "Funcionário admitido!");
          setOpenCreate(false);
          setEditEmployee(null);
          query.refetch();
        }}
      />

      <TerminateEmployeeDialog
        employee={terminateEmployee}
        onClose={() => setTerminateEmployee(null)}
        onSuccess={() => {
          toast.success("Funcionário desligado!");
          setTerminateEmployee(null);
          query.refetch();
        }}
      />
    </div>
  );
}
