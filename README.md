<<h1 align="center">
  <img src="https://user-images.githubusercontent.com/2679513/131189167-18ea5fe1-c578-47f6-9785-3748178e4312.png" width="150px"/><br/>
  Speckle | Power BI
</h1>

<p align="center"><a href="https://twitter.com/SpeckleSystems"><img src="https://img.shields.io/twitter/follow/SpeckleSystems?style=social" alt="Twitter Follow"></a> <a href="https://speckle.community"><img src="https://img.shields.io/discourse/users?server=https%3A%2F%2Fspeckle.community&amp;style=flat-square&amp;logo=discourse&amp;logoColor=white" alt="Community forum users"></a> <a href="https://speckle.systems"><img src="https://img.shields.io/badge/https://-speckle.systems-royalblue?style=flat-square" alt="website"></a> <a href="https://speckle.guide/dev/"><img src="https://img.shields.io/badge/docs-speckle.guide-orange?style=flat-square&amp;logo=read-the-docs&amp;logoColor=white" alt="docs"></a></p>

> Speckle is the first AEC data hub that connects with your favorite AEC tools. Speckle exists to overcome the challenges of working in a fragmented industry where communication, creative workflows, and the exchange of data are often hindered by siloed software and processes. It is here to make the industry better.

<h3 align="center">
    Speckle Connector and 3D Visual for Power BI
</h3>

## Features

Speckle Power BI Data Connector lets you easily get data from Speckle into Power BI reports and visualizations. You can access and analyze data from various AEC apps (like Revit, Archicad, Grasshopper, and more) and open-source files (IFC, STL, OBJ, etc.) into Power BI with ease. 

<p align="center">
  <div align="center">
    <a href="https://app.speckle.systems/connectors/">
      Download Power BI Connector
    </a>
  </div>
    Download Power BI Connector
  </a>
</p>

Speckle’s connection to Power BI consists of two parts:

- **Data Connector** fetches the data you uploaded from AEC apps to Speckle.
- **3D Visual** allows you to see those models in 3D within Power BI.

![Desktop - 1 (1)](https://github.com/specklesystems/speckle-powerbi/assets/51519350/6d2c5224-965f-4eae-b869-be26cb48c6b2)

## Repository Structure

This repository is home to our Power BI connector. The Speckle Server provides all the web-facing functionality and can be found [here](https://github.com/specklesystems/Server).

`src/powerbi-data-connector` contains all the code for the Data connector.

`src/powerbi-visual` contains all the code for 3D Visual.

## Installation

Power BI connector installer can be downloaded from the [connectors portal](https://app.speckle.systems/connectors/). Full instructions for [installation](https://docs.speckle.systems/connectors/power-bi#setup) and [configuration](https://docs.speckle.systems/connectors/power-bi#why-dont-i-see-speckle-as-a-data-source-in-power-bi) can be found on our docs.

### 3D Visual

3D Visual can be imported as any other Power BI custom visual.

1. Navigate to the Visualization Pane.
2. Click the three dots (…) and select “Import a visual from a file”.
3. Go to `Documents/Power BI Desktop/Custom Visuals` and import `Speckle 3D Visual.pbiviz` file.
4. Speckle cube will appear in the Visualization pane.

For more on how to use the visual, [check our docs](https://docs.speckle.systems/connectors/power-bi).

## Quick Start

To get started with Power BI connector, please take a look at the [documentation](https://docs.speckle.systems/connectors/power-bi) and extensive [tutorials](https://www.youtube.com/@SpeckleSystems) published. 

## Development Setup

### For local development of the 3D Visual

1. **Clone the repository**:
   ```bash
   git clone https://github.com/specklesystems/speckle-powerbi.git
   cd speckle-powerbi
   ```

2. **Navigate to the visual directory**:
   ```bash
   cd src/powerbi-visual
   ```

3. **Install dependencies**:
   ```bash
   npm install
   # or
   yarn install
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

5. **Build the visual**:
   ```bash
   # Development build
   npm run build:dev
   
   # Production build
   npm run build
   ```

### For local development of the Data Connector

1. **Install PowerQuery SDK**:
   Follow the instructions from the [official docs](https://docs.microsoft.com/en-us/power-query/installingsdk)

2. **Open the project in Visual Studio Code**:
   - Open `src/powerbi-data-connector/Speckle.proj`
   - Build the project to generate the `.mez` file

3. **Testing the connector**:
   - Visual Studio will automatically copy the `.mez` file to the appropriate location
   - Restart Power BI Desktop to see the latest changes

## About Speckle

What is Speckle? Check our ![YouTube Video Views](https://img.shields.io/youtube/views/B9humiSpHzM?label=Speckle%20in%201%20minute%20video&style=social)

### Features

- **Object-based:** say goodbye to files! Speckle is the first object based platform for the AEC industry
- **Version control:** Speckle is the Git & Hub for geometry and BIM data
- **Collaboration:** share your designs collaborate with others
- **3D Viewer:** see your CAD and BIM models online, share and embed them anywhere
- **Interoperability:** get your CAD and BIM models into other software without exporting or importing
- **Real time:** get real time updates and notifications and changes
- **GraphQL API:** get what you need anywhere you want it
- **Webhooks:** the base for a automation and next-gen pipelines
- **Built for developers:** we are building Speckle with developers in mind and got tools for every stack
- **Built for the AEC industry:** Speckle connectors are plugins for the most common software used in the industry such as Revit, Rhino, Grasshopper, AutoCAD, Civil 3D, Excel, Unreal Engine, Unity, QGIS, Blender and more!

### Try Speckle now!

Give Speckle a try in no time by:

- [![app.speckle.systems](https://img.shields.io/badge/https://-app.speckle.systems-0069ff?style=flat-square&logo=hackthebox&logoColor=white)](https://app.speckle.systems) ⇒ creating an account at our public server

### Resources

- [![Community forum users](https://img.shields.io/badge/community-forum-green?style=for-the-badge&logo=discourse&logoColor=white)](https://speckle.community) for help, feature requests or just to hang with other speckle enthusiasts, check out our community forum!
- [![website](https://img.shields.io/badge/tutorials-speckle.systems-royalblue?style=for-the-badge&logo=youtube)](https://speckle.systems) our tutorials portal is full of resources to get you started using Speckle
- [![docs](https://img.shields.io/badge/docs-speckle.systems-orange?style=for-the-badge&logo=read-the-docs&logoColor=white)](https://docs.speckle.systems) reference on almost any end-user and developer functionality
