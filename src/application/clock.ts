/** Production always reads wall time; the dev-only preview can inject one fixed instant. */
export const clock={now:()=>Date.now()};
