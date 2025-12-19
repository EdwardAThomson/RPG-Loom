import concurrently from 'concurrently';

concurrently(
  [
    { command: 'npm --workspace gateway run dev', name: 'gateway', prefixColor: 'blue' },
    { command: 'npm --workspace web run dev', name: 'web', prefixColor: 'green' }
  ],
  { killOthers: ['failure', 'success'] }
);
