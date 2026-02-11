import { getMonthRef } from "./format";
import { normalizeDate } from "./filters";

const getSafeDay = (year, month, day) => {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return safeDay;
};

export const getRecurrenceBaseDate = (client) => normalizeDate(client?.recorrenciaData);

export const getRecurrenceDay = (client) => {
  const baseDate = getRecurrenceBaseDate(client);
  if (baseDate) return baseDate.getDate();
  const day = Number(client?.recorrenciaDia || 0);
  if (!Number.isFinite(day) || day <= 0) return null;
  return day;
};

export const getDueDateForMonth = (year, month, day) => {
  const safeDay = getSafeDay(year, month, day);
  return new Date(year, month, safeDay);
};

export const getNextRecurringDate = (client, referenceDate = new Date()) => {
  const day = getRecurrenceDay(client);
  if (!day) return null;
  const todayStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const baseDate = getRecurrenceBaseDate(client);
  const referenceMonthRef = getMonthRef(referenceDate);
  let targetYear = referenceDate.getFullYear();
  let targetMonth = referenceDate.getMonth();

  if (baseDate) {
    const baseMonthRef = getMonthRef(baseDate);
    if (referenceMonthRef < baseMonthRef) {
      targetYear = baseDate.getFullYear();
      targetMonth = baseDate.getMonth();
    }
  }

  let dueDate = getDueDateForMonth(targetYear, targetMonth, day);
  if (dueDate < todayStart) {
    dueDate = getDueDateForMonth(targetYear, targetMonth + 1, day);
  }
  return dueDate;
};

export const getDueDateForMonthRef = (client, monthRef) => {
  const day = getRecurrenceDay(client);
  if (!day) return null;
  const baseDate = getRecurrenceBaseDate(client);
  const baseMonthRef = baseDate ? getMonthRef(baseDate) : "";
  if (baseMonthRef && monthRef < baseMonthRef) return null;
  const [yearStr, monthStr] = String(monthRef || "").split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (!year || Number.isNaN(monthIndex)) return null;
  return getDueDateForMonth(year, monthIndex, day);
};

export const getRecurrenceStartMonthRef = (client) => {
  const baseDate = getRecurrenceBaseDate(client);
  return baseDate ? getMonthRef(baseDate) : "";
};
