// CPF de teste — sempre aceito pelo sistema, nunca gravado como duplicata
export const TEST_CPF = "41873560885";
export function isTestCPF(cpf: string) { return cpf.replace(/\D/g,"") === TEST_CPF; }

export function cpfDigits(v: string) { return v.replace(/\D/g, ""); }

export function maskCPF(v: string) {
  v = cpfDigits(v).slice(0, 11);
  return v.replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2");
}

export function maskPhone(v: string) {
  v = v.replace(/\D/g, "");
  return v.length <= 10
    ? v.replace(/(\d{2})(\d{4})(\d{0,4})/,"($1) $2-$3")
    : v.replace(/(\d{2})(\d{5})(\d{0,4})/,"($1) $2-$3");
}

export function validCPF(cpf: string): boolean {
  cpf = cpfDigits(cpf);
  // CPF de teste — sempre válido
  if (cpf === TEST_CPF) return true;
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let s = 0, r: number;
  for (let i = 0; i < 9; i++) s += +cpf[i] * (10 - i);
  r = (s * 10) % 11; if (r >= 10) r = 0; if (r !== +cpf[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +cpf[i] * (11 - i);
  r = (s * 10) % 11; if (r >= 10) r = 0;
  return r === +cpf[10];
}

export function genCode(): string {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let code = "BTQ-";
  for (let i = 0; i < 5; i++) code += c[Math.floor(Math.random() * c.length)];
  return code;
}

export function slugify(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9\s-]/g,"").trim().replace(/\s+/g,"-").replace(/-+/g,"-").slice(0,60);
}

export function formatDate(d: string | Date, opts?: Intl.DateTimeFormatOptions) {
  return new Date(d).toLocaleDateString("pt-BR", opts ?? { day:"2-digit", month:"2-digit", year:"numeric" });
}

export function formatDateTime(d: string | Date) {
  return new Date(d).toLocaleString("pt-BR", {
    day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit",
  });
}

export function periodRange(period: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: Date;
  switch (period) {
    case "today":  from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
    case "7days":  from = new Date(now.getTime() - 7  * 86400000); break;
    case "month":  from = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "year":   from = new Date(now.getFullYear(), 0, 1); break;
    default:       from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  return { from: from.toISOString(), to };
}
