module.exports = {
  apps: [{
    name:         'fixit',
    script:       'src/server.js',
    instances:    'max',          // use all CPU cores
    exec_mode:    'cluster',
    watch:        false,
    max_memory_restart: '500M',
    env_production: {
      NODE_ENV: 'production',
      PORT:      4000,
    },
    error_file:   './logs/err.log',
    out_file:     './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    restart_delay: 3000,
    max_restarts:  10,
  }]
};
