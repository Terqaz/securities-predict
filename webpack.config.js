var path = require('path');

module.exports = {
  entry: "./src/app.ts",
  target: 'node20.10',
  output: {
    filename: "app.js",
    path: path.resolve(__dirname, 'build')
  },
  // Enable sourcemaps for debugging webpack's output.
  // devtool: "source-map",
  resolve: {
    extensions: ["", ".webpack.js", ".web.js", ".ts", ".tsx", ".js"],
    // extensions: [".ts", ".tsx", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        exclude: /node_modules/,
      },
      // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
      // { test: /\.js$/, loader: "source-map-loader" },
    ],
  },
  // Other options...
  node: {
    global: false,
    __filename: true,
    __dirname: true,
  },
};