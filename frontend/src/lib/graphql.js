const GRAPHQL_URL =
  process.env.NEXT_PUBLIC_GRAPHQL_URL || "http://localhost:4000/graphql";

export function getSession() {
  if (typeof window === "undefined") return null;

  try {
    const token = window.localStorage.getItem("token");
    const user = window.localStorage.getItem("user");
    if (!token || !user) return null;

    return { token, user: JSON.parse(user) };
  } catch {
    return null;
  }
}

export async function graphqlRequest(query, variables = {}) {
  const session = getSession();
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(result?.errors?.[0]?.message || "The request failed.");
  }
  if (result.errors?.length) {
    throw new Error(result.errors[0].message || "The request failed.");
  }

  return result.data;
}

export function formatDate(value, options = {}) {
  if (!value) return "Date unavailable";

  const date =
    typeof value === "number" || /^\d+$/.test(String(value))
      ? new Date(Number(value))
      : new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    ...options,
  }).format(date);
}
