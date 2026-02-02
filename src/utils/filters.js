export const getPresetRange = (type) => {
  const now = new Date();
  if (type === "dia") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start, end };
  }
  if (type === "mes") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }
  if (type === "ano") {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { start, end };
  }
  return { start: null, end: null };
};

export const normalizeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value.toDate) return value.toDate();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const filterByRange = (items, field, range) => {
  if (!range?.start && !range?.end) return items;
  const startTime = range.start ? range.start.getTime() : null;
  const endTime = range.end ? range.end.getTime() : null;
  return items.filter((item) => {
    const date = normalizeDate(item[field]);
    if (!date) return false;
    const time = date.getTime();
    if (startTime && time < startTime) return false;
    if (endTime && time > endTime) return false;
    return true;
  });
};

export const groupByDay = (items, field) => {
  const map = new Map();
  items.forEach((item) => {
    const date = normalizeDate(item[field]);
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const key = `${yyyy}-${mm}-${dd}`;
    map.set(key, (map.get(key) || 0) + Number(item.value || 0));
  });
  return Array.from(map.entries())
    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
    .map(([key, value]) => ({ date: key, value }));
};

export const groupExpensesByCategory = (items) => {
  const map = new Map();
  items.forEach((item) => {
    const category = item.categoria || "Outros";
    map.set(category, (map.get(category) || 0) + item.valor);
  });
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
};
