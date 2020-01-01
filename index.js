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
    this.originalStage = this.options.stage || this.serverless.service.provider.stage;
    this.originalRegion = this.options.region || this.serverless.service.provider.region;
    this.buildPlugin = this.serverless.service.custom
      ? this.serverless.service.custom.buildPlugin
      : {};

    // @todo if deployment bucket is set it should be removed when deploying with noDeploy
    // this.uuidDeploymentBucket = uuidV4();

    if (this.options.buildPlugin) {
      delete this.serverless.service.provider.deploymentBucket;
      this.options = Object.assign(this.options, {
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
      const stack = JSON.parse(
        fse.readFileSync(
          path.join('.serverless', 'cloudformation-template-update-stack.json'),
          'utf8',
        ),
      );

      // const state = JSON.parse(
      //   fse.readFileSync(
      //     path.join('.serverless', 'serverless-state.json'),
      //     'utf8',
      //   ),
      // );

      delete stack.Resources.ServerlessDeploymentBucket;

      if (!stack.Parameters) {
        stack.Parameters = {};
      }

      // add ServerlessDeploymentBucket, Stage, and ArtifactPath path to Parameters

      if (!stack.Parameters.ServerlessDeploymentBucket) {
        Object.assign(stack.Parameters, {
          ServerlessDeploymentBucket: {
            Type: 'String',
            Description: 'Deployment Bucket Name',
          },
        });
      }

      if (!stack.Parameters.Stage) {
        Object.assign(stack.Parameters, {
          Stage: {
            Type: 'String',
            Description: 'Serverless Stage',
          },
        });
      }

      if (!stack.Parameters.ArtifactPath) {
        Object.assign(stack.Parameters, {
          ArtifactPath: {
            Type: 'String',
            Description: 'Artifact path',
            AllowedPattern: '.*/',
          },
        });
      }

      delete stack.Resources.ServerlessDeploymentBucketPolicy;

      const serviceName = this.serverless.service.service;
      let artifactPath;
      const replacer = (key, value) => {
        if (typeof value === 'string') {
          // eslint-disable-next-line no-template-curly-in-string
          const buildPluginStage = this.buildPlugin.stage || '${Stage}';
          // eslint-disable-next-line no-template-curly-in-string
          const buildPluginRegion = this.buildPlugin.region || '${AWS::Region}';
          // eslint-disable-next-line no-template-curly-in-string
          const buildPluginArtifact = this.buildPlugin.artifactPath || '${ArtifactPath}';
          const regexRow = new RegExp(
            `(?:(?!").)*?(${this.options.stage}|${this.options.region}|serverless/${serviceName}/.+/[0-9-T:.Z]+/).*`,
            'g',
          );
          const regexStage = new RegExp(this.options.stage, 'g');
          const regexRegion = new RegExp(this.options.region, 'g');
          const regexArtifact = new RegExp(
            `serverless/${serviceName}/.+/[0-9-T:.Z]+/`,
            'g',
          );

          if (!artifactPath) {
            const testArtifactPath = regexArtifact.exec(value);
            artifactPath = testArtifactPath ? testArtifactPath[0] : undefined;
          }

          return value
            .replace(regexRow, (found) => (key !== 'Fn::Sub' ? `###SUB###${found}###/SUB###` : found))
            .replace(regexArtifact, `${buildPluginArtifact}`)
            .replace(regexStage, buildPluginStage)
            .replace(regexRegion, buildPluginRegion);
        }
        return value;
      };

      const buildPluginDir = this.buildPlugin.buildDirectory || '.buildPlugin';

      // Create buildPlugin deployment directory
      fse.mkdirsSync(buildPluginDir);

      // Save template
      const templatePathJson = path.join(
        buildPluginDir,
        'cloudformation-template-update-stack.json',
      );
      const templatePathJinja = path.join(
        buildPluginDir,
        'cloudformation-template-update-stack.json.j2',
      );
      const parameterizedTemplate = JSON.stringify(stack, replacer, 2)
        .replace(/"(?:(?!").)*?###SUB###/g, '{ "Fn::Sub": "')
        .replace(/###\/SUB###"/g, '" }');

      const parameterizedTemplateJson = JSON.stringify(
        JSON.parse(parameterizedTemplate),
      );
      fse.writeFileSync(templatePathJson, parameterizedTemplateJson);
      fse.writeFileSync(templatePathJinja, parameterizedTemplateJson);
      this.log(`Created template ${templatePathJson} & ${templatePathJinja}`);

      // // Save state
      // const statePathJson = path.join(buildPluginDir, "serverless-state.json");
      // const statePathJinja = path.join(
      //   buildPluginDir,
      //   "serverless-state.json.j2"
      // );
      // const parameterizedState = JSON.stringify(state, replacer, 2)
      //   .replace(/"(?:(?!").)*?###SUB###/g, '{ "Fn::Sub": "')
      //   .replace(/###\/SUB###"/g, '" }');
      // const parameterizedStateJson = JSON.stringify(
      //   JSON.parse(parameterizedState)
      // );
      // fse.writeFileSync(statePathJson, parameterizedStateJson);
      // fse.writeFileSync(statePathJinja, parameterizedStateJson);
      // this.log(`Created state ${statePathJson} & ${statePathJinja}`);

      Object.keys(this.serverless.service.functions)
        .reduce((result, key) => {
          const artifact = this.serverless.service.functions[key].package.artifact
            || this.serverless.service.artifact;
          if (result.indexOf(artifact) === -1) {
            result.push(artifact);
          }
          return result;
        }, [])
        .forEach((zipfile) => {
          const zipfilename = path.parse(zipfile).base;
          // Copy zip
          fse.copySync(zipfile, path.join(buildPluginDir, zipfilename));
          this.log(
            `Copied zip ${zipfilename} to ${buildPluginDir}/${zipfilename}`,
          );
        });
    }
    this.options.stage = this.originalStage;
    this.options.region = this.originalRegion;
  }

  log(message) {
    this.serverless.cli.consoleLog(
      `Serverless Plugin CI Build: ${chalk.yellow(message)}`,
    );
  }
}

module.exports = CIBuildPlugin;
