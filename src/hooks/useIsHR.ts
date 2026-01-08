export function useIsHR() {
  const sess = localStorage.getItem("employee_session");
  const emp = sess ? JSON.parse(sess) : null;
  const canHR = emp?.role === "rh";
  return { data: canHR, isLoading: false };
}
