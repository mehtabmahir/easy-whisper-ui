type Action = "open" | "live" | "help" | "clear" | "stop" | "skip" | "settings";

const paths: Record<Action, string> = {
  open: "M3 7V5a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v2M3 9h18l-2 11H5L3 9Z",
  live: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 6v1a6 6 0 0 0 12 0v-1M12 18v4m-4 0h8",
  help: "M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1.1-1.5 2.5M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  clear: "m4 15 9-11a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3l-8 9H8l-4-3a1.5 1.5 0 0 1 0-2Zm5-6 8 7M12 20h9",
  stop: "M6 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  skip: "m5 4 12 8-12 8V4Zm14 0v16",
  settings: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6"
};

export default function ActionIcon({ name }: { name: Action }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={paths[name]} />
  </svg>;
}
