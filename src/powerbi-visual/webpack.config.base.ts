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
      minimize: isProd // enable minimization for create *.pbiviz file less than 2 Mb, can be disabled for dev mode
    },
    devtool: isProd ? 'none' : 'inline-source-map',
    mode: isProd ? 'production' : 'development',
    module: {
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
        }
      ]
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js', '.css'],
      alias: {
        src: path.resolve(__dirname, 'src/'),
        assets: path.resolve(__dirname, 'assets/')
      },
      plugins: [new TsconfigPathsPlugin()]
    },
    output: {
      publicPath: '/assets',
      path: path.join(__dirname, '/.tmp', 'drop'),
      library: +powerbiApi.version.replace(/\./g, '') >= 320 ? pbivizFile.visual.guid : undefined,
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
            }
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
        apiVersion: powerbiApi.version,
        capabilitiesSchema: powerbiApi.schemas.capabilities,
        pbivizSchema: powerbiApi.schemas.pbiviz,
        stringResourcesSchema: powerbiApi.schemas.stringResources,
        dependenciesSchema: powerbiApi.schemas.dependencies,
        devMode: false,
        generatePbiviz: isProd,
        generateResources: true,
        minifyJS: isProd,
        minify: isProd,
        modules: true,
        visualSourceLocation: '../../src/visual',
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
          })
    ]
  }

  return config
}
