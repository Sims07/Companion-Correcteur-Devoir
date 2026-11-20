type CopyActionIconName = 'open' | 'review' | 'retry' | 'start' | 'remove' | 'edit' | 'add' | 'close' | 'next' | 'back' | 'duplicate' | 'download' | 'distribute' | 'connect';

export function CopyActionIcon({ name }: { name: CopyActionIconName }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {name === 'open' && <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>}
    {name === 'review' && <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5h6M8.5 13l2.5 2.5 4.5-5" /></>}
    {name === 'retry' && <><path d="M20 11a8 8 0 1 0-2 6" /><path d="M20 4v7h-7" /></>}
    {name === 'start' && <path d="m8 5 11 7-11 7z" />}
    {name === 'remove' && <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />}
    {name === 'edit' && <path d="m4 20 4-1 12-12-3-3L5 16l-1 4Zm10-13 3 3" />}
    {name === 'add' && <path d="M12 5v14M5 12h14" />}
    {name === 'close' && <path d="m6 6 12 12M18 6 6 18" />}
    {name === 'next' && <path d="M4 12h15m-6-6 6 6-6 6" />}
    {name === 'back' && <path d="M20 12H5m6-6-6 6 6 6" />}
    {name === 'duplicate' && <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 5V4a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2v10a1 1 0 0 0 1 1h1" /></>}
    {name === 'download' && <path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" />}
    {name === 'distribute' && <path d="M5 9h14M5 15h14" />}
    {name === 'connect' && <path d="m7 7 3-3m1 7 3-3M5 7l7 7-2 2a5 5 0 0 1-7-7l2-2Zm-1 9-2 4" />}
  </svg>;
}
