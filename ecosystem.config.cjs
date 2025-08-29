module.exports = {
  apps: [
    {
      name: 'alphabot-server',
      script: 'main_server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '500M',
      error_file: './logs/server_error.log',
      out_file: './logs/server_out.log',
      log_file: './logs/server_combined.log',
      time: true
    },
    {
      name: 'alphabot-bot',
      script: 'bot.js',
      env: {
        NODE_ENV: 'production'
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      restart_delay: 5000,
      max_restarts: 15,
      min_uptime: '20s',
      max_memory_restart: '300M',
      error_file: './logs/bot_error.log',
      out_file: './logs/bot_out.log',
      log_file: './logs/bot_combined.log',
      time: true
    }
  ]
}