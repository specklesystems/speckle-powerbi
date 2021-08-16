# Speckle QGIS: The Speckle 2.0 PowerBI Connector

[![Twitter Follow](https://img.shields.io/twitter/follow/SpeckleSystems?style=social)](https://twitter.com/SpeckleSystems) [![Community forum users](https://img.shields.io/discourse/users?server=https%3A%2F%2Fdiscourse.speckle.works&style=flat-square&logo=discourse&logoColor=white)](https://discourse.speckle.works) [![website](https://img.shields.io/badge/https://-speckle.systems-royalblue?style=flat-square)](https://speckle.systems) [![docs](https://img.shields.io/badge/docs-speckle.guide-orange?style=flat-square&logo=read-the-docs&logoColor=white)](https://speckle.guide/dev/)

<details>
  <summary>What is Speckle?</summary>

Speckle is the Open Source Data Platform for AEC. Speckle allows you to say goodbye to files: we give you object-level control of what you share, infinite versioning history & changelogs. Read more on [our website](https://speckle.systems).

</details>

## Introduction

This repo is the home to our Speckle 2.0 PowerBI project. The [Speckle Server](https://github.com/specklesystems/Server) is providing all the web-facing functionality and can be found [here](https://github.com/specklesystems/Server).

## Documentation

Comprehensive developer and user documentation can be found in our:

#### 📚 [Speckle Docs website](https://speckle.guide/dev/)

## Install

Go to the [Releases](https://github.com/specklesystems/speckle-powerbi/releases) page, downlad the `.mez` file of the latest release and copy it into the following folder in your computer:

```
YOUR_USER_FOLDER\Documents\Power BI Desktop\Custom Connectors\
```

Now open PowerBI and you should see `Speckle (beta)` appear in the data source.

![PowerBI](https://user-images.githubusercontent.com/2316535/129580913-02e5e662-f344-419c-9894-e97055930c58.png)

## Usage

> More detailed instructions on how to use the connector will be added shortly!

## Developing & Debugging

We encourage everyone interested to debug / hack / contribute / give feedback to this project.

### Setup

#### Install PowerQuery SDK

Follow the instructions from the [official docs](https://docs.microsoft.com/en-us/power-query/installingsdk)

#### Build with Visual Studio

Every time you build the connector, VisualStudio will copy the latest `.mez` connector file to the appropriate location. Just restart PowerBI to see the latest changes.

#### Debug

You can start the PowerQuery connector in VisualStudio, this will open a standalone connector you can use for testing purposes.

We don't know of a way to debug the connector live in PowerBI, but we'd be happy to hear about it.
