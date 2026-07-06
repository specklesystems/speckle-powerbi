/* eslint-disable @typescript-eslint/no-var-requires */
import path from 'path'

// api configuration
import powerbi from 'powerbi-visuals-api'
import ExtraWatchWebpackPlugin from 'extra-watch-webpack-plugin'
import { BundleAnalyzerPlugin as Visualizer } from 'webpack-bundle-analyzer'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import { PowerBICustomVisualsWebpackPlugin } from 'powerbi-visuals-webpack-plugin'
import webpack from 'webpack'
import fs from 'fs'
import { WebpackConfiguration } from 'webpack-cli'
import { VueLoaderPlugin } from 'vue-loader'
import { TsconfigPathsPlugin } from 'tsconfig-paths-webpack-plugin'
import HtmlWebpackPlugin from 'html-webpack-plugin'

/**
 * MAIN CONSTS
 */
const devServerPort = 8080
const pbivizPath = './pbiviz.json'
const capabilitiesPath = './capabilities.json'
const pluginLocation = './.tmp/precompile/visualPlugin.ts' // path to visual plugin file, the file generates by the plugin

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const powerbiApi: any = powerbi // Types for PowerBI seem to be off, so I'm instead forcing it to `any`

// visual configuration json path
const pbivizFile = require(path.join(__dirname, pbivizPath))

const packageJsonFile = require(path.join(__dirname, 'package.json'))
pbivizFile.visual.version = packageJsonFile.version

// the visual capabilities content
const capabilitiesFile = require(path.join(__dirname, capabilitiesPath))

// string resources
const resourcesFolder = path.join('.', 'stringResources')
const localizationFolders = fs.existsSync(resourcesFolder) && fs.readdirSync(resourcesFolder)
const statsLocation = '../../webpack.statistics.html'

// babel options to support IE11
const babelOptions = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          ie: '11'
        },
        useBuiltIns: 'entry',
        corejs: 3,
        modules: false
      }
    ]
  ],
  plugins: [],
  sourceType: 'unambiguous', // tell to babel that the project can contain different module types, not only es2015 modules
  cacheDirectory: path.join('.tmp', 'babelCache') // path for cache files
}

export const buildConfig = (params: { mode: 'dev' | 'prod' }) => {
  const isProd = params.mode === 'prod'
  const isDev = params.mode === 'dev'

  const loadCert = () => {
    const keyPath = path.resolve(__dirname, 'localhost-key.pem')
    const certPath = path.resolve(__dirname, 'localhost.pem')
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      console.log('Unable to locate localhost certs, skipping...')
      return undefined
    }

    console.log(
      'Using locally generated localhost certs, make sure the CA cert is installed & trusted!'
    )
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    }
  }
  const certInfo = isProd ? undefined : loadCert()

  const config: WebpackConfiguration = {
    entry: {
      visual: pluginLocation
    },
    optimization: {
      concatenateModules: false,
      // a Power BI visual must be ONE js file: the pbiviz manifest embeds a
      // single asset, so a stray emitted chunk would be picked instead of the
      // visual ("Visual does not have a plugin")
      splitChunks: false,
      runtimeChunk: false,
      minimize: isProd // enable minimization for create *.pbiviz file less than 2 Mb, can be disabled for dev mode
    },
    // external map file — inline-source-map balloons visual.js to ~29MB, which
    // the Service dev-visual host fails to transfer into the sandbox (masked
    // as the "reading 'name'" sendError crash)
    devtool: isProd ? false : 'source-map',
    mode: isProd ? 'production' : 'development',
    module: {
      parser: {
        javascript: {
          // inline all dynamic import() chunks into the main bundle — a Power
          // BI visual must be ONE js file
          dynamicImportMode: 'eager'
        }
      },
      rules: [
        {
          test: /\.vue$/,
          use: ['vue-loader']
        },
        {
          parser: {
            amd: false
          }
        },
        {
          test: /(\.ts)x|\.ts$/,
          use: [
            {
              loader: 'babel-loader',
              options: {
                presets: [
                  // '@babel/react',
                  '@babel/env'
                ]
              }
            },
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: false,
                experimentalWatchApi: false,
                appendTsSuffixTo: [/\.vue$/]
              }
            }
          ],
          exclude: [/node_modules/],
          include: /.tmp|powerbi-visuals-|src|precompile\\visualPlugin.ts/
        },
        {
          test: /(\.js)x|\.js$/,
          use: [
            {
              loader: 'babel-loader',
              options: babelOptions
            }
          ],
          exclude: [/node_modules/]
        },
        {
          test: /\.json$/,
          loader: 'json-loader',
          type: 'javascript/auto'
        },
        {
          test: /\.(css|scss)?$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader']
        },
        {
          test: /\.(woff|ttf|ico|woff2|jpg|jpeg|png|webp|svg)$/i,
          use: ['base64-inline-loader']
        },
        {
          // duckdb's nested browser worker (~800KB) is imported `?url` and
          // constructed via `new Worker(url)` INSIDE the packfile worker. A
          // cross-origin script URL is CSP-blocked there and the worker can't
          // run the shim; inline it as a data: URL so `new Worker(data:...)`
          // works natively (probe-verified: data: workers pass in the Service).
          test: /duckdb-browser.*worker.*\.js$/,
          resourceQuery: /url/,
          type: 'asset/inline'
        },
        {
          // Other `?url` imports (the 33-37MB duckdb wasm) — far too big to
          // inline; emit as files with an absolute URL (publicPath). Fetched
          // cross-origin with CORS from the worker. Prod hosts these on Speckle.
          // Exclude the browser worker so the asset/inline rule above wins
          // (otherwise this later rule's `type` overrides it).
          resourceQuery: /url/,
          exclude: /duckdb-browser.*worker.*\.js$/,
          type: 'asset/resource'
        }
      ]
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js', '.css'],
      alias: {
        src: path.resolve(__dirname, 'src/'),
        assets: path.resolve(__dirname, 'assets/'),
        // one three instance for the visual AND the locally-linked viewer
        // packages (file: symlinks resolve deps in the monorepo, not here)
        three: path.resolve(
          __dirname,
          '../../../speckle-server-internal/node_modules/three'
        ),
        // duckdb-wasm's exports field blocks the worker subpaths that
        // packfile-manager imports with `?url`; alias straight to the files.
        // Must point at the monorepo copy — it carries the yarn patch whose
        // JS glue matches the vendored wasm binaries.
        '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js': path.resolve(
          __dirname,
          '../../../speckle-server-internal/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js'
        ),
        '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js': path.resolve(
          __dirname,
          '../../../speckle-server-internal/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js'
        )
      },
      plugins: [new TsconfigPathsPlugin()],
      mainFields: ['module', 'browser', 'main']
    },
    output: {
      // dev must be ABSOLUTE: inside the PBI sandbox the visual runs on a
      // foreign origin (app.powerbi.com / sources:///), so relative asset URLs
      // (wasm, fonts, chunks) resolve against the wrong base. The dev server
      // sends access-control-allow-origin: * so cross-origin fetches work.
      publicPath: isProd ? '/assets/' : 'https://localhost:8080/assets/',
      path: path.join(__dirname, '/.tmp', 'drop'),
      // the library global must match the guid the SERVED pbiviz.json
      // advertises — in dev mode the PBI plugin renames it to <guid>_DEBUG,
      // and the Service host resolves the visual via window[<guid>].default
      library:
        +powerbiApi.version.replace(/\./g, '') >= 320
          ? isProd
            ? pbivizFile.visual.guid
            : `${pbivizFile.visual.guid}_DEBUG`
          : undefined,
      libraryTarget: +powerbiApi.version.replace(/\./g, '') >= 320 ? 'var' : undefined
    },
    ...(isProd
      ? {}
      : {
          devServer: {
            static: {
              directory: path.join(__dirname, '.tmp', 'drop'), // path with assets for dev server, they are generated by webpack plugin
              publicPath: '/assets'
            },
            compress: true,
            port: devServerPort, // dev server port
            hot: false,
            ...(certInfo
              ? {
                  server: {
                    type: 'https',
                    options: {
                      ...certInfo
                    }
                  }
                }
              : {
                  https: {}
                }),
            liveReload: false,
            webSocketServer: false,
            headers: {
              'access-control-allow-origin': '*',
              'cache-control': 'public, max-age=0'
            },
            ...(isDev
              ? {
                  historyApiFallback: {
                    // <-- Add/modify historyApiFallback
                    rewrites: [
                      { from: /^\/dev$/, to: '/assets/dev.html' } // Route /dev to the generated dev.html
                    ]
                  }
                }
              : {})
          }
        }),
    externals:
      powerbiApi.version.replace(/\./g, '') >= 320
        ? {
            'powerbi-visuals-api': 'null',
            fakeDefine: 'false'
          }
        : {
            'powerbi-visuals-api': 'null',
            fakeDefine: 'false',
            corePowerbiObject: "Function('return this.powerbi')()",
            realWindow: "Function('return this')()"
          },
    plugins: [
      new webpack.DefinePlugin({
        __VUE_OPTIONS_API__: JSON.stringify(true),
        __VUE_PROD_DEVTOOLS__: JSON.stringify(false)
      }),
      new VueLoaderPlugin(),
      new MiniCssExtractPlugin({
        filename: 'visual.css',
        chunkFilename: '[id].css'
      }),
      new Visualizer({
        reportFilename: statsLocation,
        openAnalyzer: false,
        analyzerMode: `static`
      }),
      // visual plugin regenerates with the visual source, but it does not require relaunching dev server
      new webpack.WatchIgnorePlugin({
        paths: [path.join(__dirname, pluginLocation), './.tmp/**/*.*']
      }),
      // custom visuals plugin instance with options
      new PowerBICustomVisualsWebpackPlugin({
        ...pbivizFile,
        compression: isProd ? 9 : 0,
        capabilities: capabilitiesFile,
        stringResources:
          localizationFolders &&
          localizationFolders.map((localization) =>
            path.join(resourcesFolder, localization, 'resources.resjson')
          ),
        // advertise pbiviz.json's apiVersion, NOT the installed package's —
        // declaring an api version the sandbox host doesn't ship an adapter
        // for kills the visual in the handshake before our code runs
        apiVersion: pbivizFile.apiVersion,
        capabilitiesSchema: powerbiApi.schemas.capabilities,
        pbivizSchema: powerbiApi.schemas.pbiviz,
        stringResourcesSchema: powerbiApi.schemas.stringResources,
        dependenciesSchema: powerbiApi.schemas.dependencies,
        // dev builds must register as <guid>_DEBUG — the Developer Visual host
        // looks the plugin up under that name; with devMode:false it finds
        // undefined and dies with "Cannot read properties of undefined ('name')"
        devMode: !isProd,
        generatePbiviz: isProd,
        generateResources: true,
        minifyJS: isProd,
        minify: isProd,
        modules: true,
        // scratch/duckdb-probe branch: bundle the stage-0 probe visual by
        // default; set PROBE=0 to build the real visual instead
        visualSourceLocation:
          process.env.PROBE === '0' ? '../../src/visual' : '../../src/probe/probeVisual',
        pluginLocation: pluginLocation,
        packageOutPath: path.join(__dirname, 'dist')
      }),
      new ExtraWatchWebpackPlugin({
        files: [pbivizPath, capabilitiesPath]
      }),
      powerbiApi.version.replace(/\./g, '') >= 320
        ? new webpack.ProvidePlugin({
            define: 'fakeDefine'
          })
        : new webpack.ProvidePlugin({
            window: 'realWindow',
            define: 'fakeDefine',
            powerbi: 'corePowerbiObject'
          }),
      ...(isDev
        ? [
            // Add HtmlWebpackPlugin for the /dev route
            new HtmlWebpackPlugin({
              filename: 'dev.html', // Output: .tmp/drop/dev.html
              templateContent: `
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="utf-8">
                    <title>Dev Component View</title>
                  </head>
                  <body>
                    <div id="app"></div>
                    <script>
                      window.onload = function() {
                        const visual = specklePowerBiVisual.default.create({
                          element: document.getElementById('app'),
                          host: {
                            // Mock the host object
                            createSelectionManager: () => ({
                              select: () => Promise.resolve(),
                              clear: () => {},
                            }),
                            refreshHostData: () => {},
                            displayWarningIcon: () => {},
                            launchUrl: () => {},
                          }
                        });
                      };
                    </script>
                  </body>
                </html>
              `
            })
          ]
        : [])
    ]
  }

  return config
}
