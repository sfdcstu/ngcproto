# Next-Gen Chat Deployment Prototype

Takes NGC builds from the agentforce-messaging repo and adds them to this repo to prepare for deployment to S3.

## Commands

- `yarn build` - copies all versions from builds/ngc and generates the manifest file
- `yarn prepare` - takes the current build from agentforce-messaging, copies it into this repo, and commits it
- `yarn setup repo <path>` - configures the `.local-config` file with the path to the agentforce-messaging repository
