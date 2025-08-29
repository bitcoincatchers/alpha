module.exports = {
  apps: [
    {
      name: 'alphabot-auth',
      script: 'node',
      args: 'main_server.js',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}