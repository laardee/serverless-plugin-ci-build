'use strict';

const fse = require('fs-extra');
const path = require('path');
const uuidV4 = require('uuid/v4');
const chalk = require('chalk');

class CIBuildPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.uuidRegion = uuidV4();
    this.uuidStage = uuidV4();
    this.buildPlugin = this.serverless.service.custom ? this.serverless.service.custom.buildPlugin : {};

    // @todo if deployment bucket is set it should be removed when deploying with noDeploy
    // this.uuidDeploymentBucket = uuidV4();

    if (this.options.buildPlugin) {
      this.options = Object.assign(this.options,
        {
          noDeploy: true,
          stage: this.buildPlugin.templateStage || this.uuidStage,
          region: this.buildPlugin.templateRegion || this.uuidRegion,
        });
    }
    this.commands = {};
    this.hooks = {
      'after:deploy:deploy': this.createArtifacts.bind(this),
    };
  }

  createArtifacts() {
    if (this.options.buildPlugin) {
      const stack =
        JSON.parse(fse.readFileSync(path.join('.serverless', 'cloudformation-template-update-stack.json'), 'utf8'));

      delete stack.Resources.ServerlessDeploymentBucket;

      const ServerlessDeploymentBucket = {
        Type: 'String',
        Description: 'Deployment Bucket Name',
      };

      if (!stack.Parameters) {
        stack.Parameters = {};
      }

      Object.assign(stack.Parameters, { ServerlessDeploymentBucket });

      const serviceName = this.serverless.service.service;

      const replacer = (key, value) => {
        if (typeof (value) === 'string') {
          const buildPluginStage = this.buildPlugin.stage || '{{ stage }}';
          const buildPluginRegion = this.buildPlugin.region || '{{ region }}';
          const buildPluginArtifact = this.buildPlugin.artifactPath || '{{ artifact_path }}';
          const regexStage = new RegExp(this.options.stage, 'g');
          const regexRegion = new RegExp(this.options.region, 'g');
          const regexArtifact = new RegExp(`serverless/${serviceName}/${buildPluginStage}/[0-9-T:.Z]+/`, 'g');
          return value.replace(regexStage, buildPluginStage)
            .replace(regexRegion, buildPluginRegion)
            .replace(regexArtifact, `${buildPluginArtifact}/`);
        }
        return value;
      };

      const buildPluginDir = this.buildPlugin.buildDirectory || '.buildPlugin';
      const templatePath = path.join(buildPluginDir, `${serviceName}.json.j2`);

      // Create buildPlugin deployment directory
      fse.mkdirsSync(buildPluginDir);

      // Save template
      const template = JSON.stringify(stack, replacer, 2);
      fse.writeFileSync(templatePath, template);
      this.log(`Created buildPlugin template ${templatePath}`);

      Object.keys(this.serverless.service.functions).reduce((result, key) => {
        const artifact = this.serverless.service.functions[key].package.artifact;
        if (result.indexOf(artifact) === -1) {
          result.push(artifact);
        }
        return result;
      }, [])
        .forEach((zipfile) => {
          const zipfilename = path.parse(zipfile).base;
          // Copy zip
          fse.copySync(
            zipfile,
            path.join(buildPluginDir, zipfilename));
          this.log(`Copied zip ${zipfilename} to ${buildPluginDir}/${zipfilename}`);
        });
    }
  }

  log(message) {
    this.serverless.cli.consoleLog(`Serverless Plugin CI Build: ${chalk.yellow(message)}`);
  }
}

module.exports = CIBuildPlugin;
