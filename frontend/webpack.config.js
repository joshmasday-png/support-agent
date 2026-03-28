const path = require('path');

module.exports = {
  entry: './index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: './',
  },
  devServer: {
    static: {
      directory: path.join(__dirname, '/'),
    },
    port: 3000,
    open: true,
    proxy: [
      {
        context: ['/api', '/ask'],
        target: 'http://localhost:3001',
      },
    ],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react'],
          },
        },
      },
    ],
  },
};
