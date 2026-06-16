module.exports = {
  apps: [
    {
      name:   'hecto-sync-attendance',
      script: './attendance.js',
      cwd:    __dirname,
      restart_delay: 10_000,
      max_restarts:  10,
    },
    {
      name:   'hecto-sync-leaves',
      script: './leaves.js',
      cwd:    __dirname,
      restart_delay: 30_000, // MySQL 실패 시 좀 더 기다렸다 재시작
      max_restarts:  10,
    },
  ],
};
