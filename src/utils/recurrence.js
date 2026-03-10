import { getMonthRef } from "./format";
import { normalizeDate } from "./filters";

const getSafeDay = (year, month, day) => {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return safeDay;
};

const toStartOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const toEndOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

export const getRecurrenceBaseDate = (client) => normalizeDate(client?.recorrenciaData);
export const getContractStartDate = (client) => normalizeDate(client?.contratoInicio);
export const getContractEndDate = (client) => normalizeDate(client?.contratoFim);

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
  const referenceStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const contractStart = getContractStartDate(client);
  const contractEnd = getContractEndDate(client);
  const contractStartDay = contractStart ? toStartOfDay(contractStart) : null;
  const contractEndDay = contractEnd ? toEndOfDay(contractEnd) : null;
  const effectiveReference =
    contractStartDay && referenceStart < contractStartDay ? contractStartDay : referenceStart;
  const baseDate = getRecurrenceBaseDate(client);
  const referenceMonthRef = getMonthRef(effectiveReference);
  let targetYear = effectiveReference.getFullYear();
  let targetMonth = effectiveReference.getMonth();

  if (baseDate) {
    const baseMonthRef = getMonthRef(baseDate);
    if (referenceMonthRef < baseMonthRef) {
      targetYear = baseDate.getFullYear();
      targetMonth = baseDate.getMonth();
    }
  }

  if (contractStartDay) {
    const contractStartMonthRef = getMonthRef(contractStartDay);
    if (referenceMonthRef < contractStartMonthRef) {
      targetYear = contractStartDay.getFullYear();
      targetMonth = contractStartDay.getMonth();
    }
  }

  let dueDate = getDueDateForMonth(targetYear, targetMonth, day);
  if (baseDate) {
    const baseStart = toStartOfDay(baseDate);
    while (dueDate < baseStart) {
      dueDate = getDueDateForMonth(dueDate.getFullYear(), dueDate.getMonth() + 1, day);
    }
  }
  if (contractStartDay) {
    while (dueDate < contractStartDay) {
      dueDate = getDueDateForMonth(dueDate.getFullYear(), dueDate.getMonth() + 1, day);
    }
  }
  while (dueDate < effectiveReference) {
    dueDate = getDueDateForMonth(dueDate.getFullYear(), dueDate.getMonth() + 1, day);
  }
  if (contractEndDay && dueDate > contractEndDay) return null;
  return dueDate;
};

export const getDueDateForMonthRef = (client, monthRef) => {
  const day = getRecurrenceDay(client);
  if (!day) return null;
  const baseDate = getRecurrenceBaseDate(client);
  const contractStart = getContractStartDate(client);
  const contractEnd = getContractEndDate(client);
  const baseMonthRef = baseDate ? getMonthRef(baseDate) : "";
  const contractStartMonthRef = contractStart ? getMonthRef(contractStart) : "";
  const contractEndMonthRef = contractEnd ? getMonthRef(contractEnd) : "";
  if (baseMonthRef && monthRef < baseMonthRef) return null;
  if (contractStartMonthRef && monthRef < contractStartMonthRef) return null;
  if (contractEndMonthRef && monthRef > contractEndMonthRef) return null;
  const [yearStr, monthStr] = String(monthRef || "").split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (!year || Number.isNaN(monthIndex)) return null;
  const dueDate = getDueDateForMonth(year, monthIndex, day);
  if (baseDate && dueDate < toStartOfDay(baseDate)) return null;
  if (contractStart && dueDate < toStartOfDay(contractStart)) return null;
  if (contractEnd && dueDate > toEndOfDay(contractEnd)) return null;
  return dueDate;
};

export const getRecurrenceStartMonthRef = (client) => {
  const baseDate = getRecurrenceBaseDate(client);
  return baseDate ? getMonthRef(baseDate) : "";
};
