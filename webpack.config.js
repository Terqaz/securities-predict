var path = require('path');
var webpack = require('webpack');

module.exports = {
  mode: 'development',

  entry: {
    index: './src/index.ts',
  },

  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },

  // Enable sourcemaps for debugging webpack's output.
  devtool: "source-map",
  resolve: {
    extensions: ["", ".webpack.js", ".web.js", ".ts", ".tsx", ".js"],
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        exclude: /node_modules/,
        options: {
          transpileOnly: true
        }
      },
      // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
      // { test: /\.js$/, loader: "source-map-loader" },
    ],
  },

  // plugins: [
  //   new webpack.ContextReplacementPlugin(
  //     /^date-fns[/\\]locale$/,
  //     new RegExp(`\\.[/\\\\](ru)[/\\\\]index\\.js$`)
  //   )
  // ],

  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    // compress: true,

    // port: 9000,
  },
  // Other options...
  // node: {
  //   global: false,
  //   __filename: true,
  //   __dirname: true,
  // },
};