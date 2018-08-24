# Serverless CI Build Plugin

Plugin hooks to deploy command and is executed with `--buildPlugin` flog.

```
sls deploy --buildPlugin
```

serverless.yml
```
plugins:
  - serverless-plugin-ci-build
```

By default region is replaced with `{{ region }}`, stage with `{{ stage }}` and artifact path `{{ artifact_path }}`. Build directory, where the j2 template and zip is created is `.package`.

To change to custom values, those can be defined in `custom` block.

```
custom:
  buildPlugin:
    buildDirectory: ".package"
    region: "{{region}"
    stage: "{{stage}}"
    artifactPath: "{{artifact_path}}"
    environment:
      SECRET: "{{secret}}"

```

To overwrite Lambda environmental variables defined in Serverless service provider, one option is to define those in custom buildPlugin environment and use in provider environment:

```
provider:
  name: aws
  runtime: nodejs4.3
  environment:
    SECRET: ${env:SECRET, self:custom.buildPlugin.environment.SECRET}
```
