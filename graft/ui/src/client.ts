import { mount, unmount } from 'svelte';
import { defineGraft, type DeploymentProps, type Mount } from '@orchardlabs/graft-sdk/client';
import Challenge from './Challenge.svelte';

const tab: Mount<DeploymentProps> = (target, props, host) => {
  const app = mount(Challenge, { target, props: { host, deploymentId: props.deploymentId } });
  return () => unmount(app);
};

export default defineGraft({
  slots: {
    'deployment.tabs': [{ id: 'challenge', label: 'Challenge', order: 80, mount: tab }]
  }
});
