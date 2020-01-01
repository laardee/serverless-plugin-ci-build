const CIBuildPlugin = require('../../src/index')
const { mergeDeepRight } = require('ramda')
const fs = require('fs-extra')

function initializePlugin(serverless = {}, options = {}) {
  const serverlessBase = {
    cli: { consoleLog: console.log },
    service: {
      provider: {
        stage: 'dev',
        region: 'us-east-1'
      }
    }
  }
  return new CIBuildPlugin(mergeDeepRight(serverlessBase, serverless), options)
}

jest.mock('fs')

describe('create template', () => {
  beforeAll(() => {
    fs.copySync = jest.fn()
    fs.writeFileSync = jest.fn()
  })
  it('Should', () => {
    fs.readFileSync = jest.fn(() => JSON.stringify({ Resources: {} }))
    const plugin = initializePlugin(
      {
        service: {
          functions: {
            func1: { package: {} }
          },
          artifact: 'service.zip'
        }
      },
      { buildPlugin: true }
    )
    plugin.createArtifacts()
    expect(fs.copySync).toBeCalledWith('service.zip', '.buildPlugin/service.zip')
    expect(fs.writeFileSync).toBeCalledWith(
      '.buildPlugin/cloudformation-template-update-stack.json',
      '{"Resources":{},"Parameters":{"ServerlessDeploymentBucket":{"Type":"String","Description":"Deployment Bucket Name"},"Stage":{"Type":"String","Description":"Serverless Stage"},"ArtifactPath":{"Type":"String","Description":"Artifact path","AllowedPattern":".*/"}}}'
    )
    expect(fs.writeFileSync).toBeCalledWith(
      '.buildPlugin/cloudformation-template-update-stack.json.j2',
      '{"Resources":{},"Parameters":{"ServerlessDeploymentBucket":{"Type":"String","Description":"Deployment Bucket Name"},"Stage":{"Type":"String","Description":"Serverless Stage"},"ArtifactPath":{"Type":"String","Description":"Artifact path","AllowedPattern":".*/"}}}'
    )
  })
})
