// Shared valid days logic — used by validate and redeem routes

const DAY_NAMES = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const DAY_NAMES_SHORT = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

export function checkValidDay(validDays: number[] | null): {
  isValid: boolean;
  validDaysText: string;
  nextValidDate: string | null;
  nextValidDay: string | null;
} {
  // NULL = all days allowed
  if (!validDays || validDays.length === 0) {
    return { isValid: true, validDaysText: "Todos os dias", nextValidDate: null, nextValidDay: null };
  }

  const today = new Date();
  const todayNum = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  const isValid = validDays.includes(todayNum);

  // Build human-readable valid days text
  const sortedDays = [...validDays].sort((a, b) => a - b);
  const validDaysText = sortedDays.map(d => DAY_NAMES[d]).join(", ");

  // Find next valid date
  let nextValidDate: string | null = null;
  let nextValidDay: string | null = null;

  if (!isValid) {
    for (let i = 1; i <= 7; i++) {
      const nextDay = (todayNum + i) % 7;
      if (validDays.includes(nextDay)) {
        const nextDate = new Date(today);
        nextDate.setDate(today.getDate() + i);
        nextValidDate = nextDate.toLocaleDateString("pt-BR", {
          weekday: "long", day: "2-digit", month: "2-digit",
        });
        nextValidDay = DAY_NAMES_SHORT[nextDay];
        break;
      }
    }
  }

  return { isValid, validDaysText, nextValidDate, nextValidDay };
}
