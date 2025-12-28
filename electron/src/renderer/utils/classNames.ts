function classNames(...values: Array<string | undefined | null | false>): string {
  return values.filter(Boolean).join(" ");
}

export default classNames;
