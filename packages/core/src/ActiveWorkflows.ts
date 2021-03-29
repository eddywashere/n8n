import { CronJob } from 'cron';

import {
	IGetExecutePollFunctions,
	IGetExecuteTriggerFunctions,
	INode,
	IPollResponse,
	ITriggerResponse,
	IWorkflowExecuteAdditionalData,
	LoggerProxy as Logger,
	Workflow,
} from 'n8n-workflow';

import {
	ITriggerTime,
	IWorkflowData,
} from './';


export class ActiveWorkflows {
	private workflowData: {
		[key: string]: IWorkflowData;
	} = {};


	/**
	 * Returns if the workflow is active
	 *
	 * @param {string} id The id of the workflow to check
	 * @returns {boolean}
	 * @memberof ActiveWorkflows
	 */
	isActive(id: string): boolean {
		return this.workflowData.hasOwnProperty(id);
	}


	/**
	 * Returns the ids of the currently active workflows
	 *
	 * @returns {string[]}
	 * @memberof ActiveWorkflows
	 */
	allActiveWorkflows(): string[] {
		return Object.keys(this.workflowData);
	}


	/**
	 * Returns the Workflow data for the workflow with
	 * the given id if it is currently active
	 *
	 * @param {string} id
	 * @returns {(WorkflowData | undefined)}
	 * @memberof ActiveWorkflows
	 */
	get(id: string): IWorkflowData | undefined {
		return this.workflowData[id];
	}


	/**
	 * Makes a workflow active
	 *
	 * @param {string} id The id of the workflow to activate
	 * @param {Workflow} workflow The workflow to activate
	 * @param {IWorkflowExecuteAdditionalData} additionalData The additional data which is needed to run workflows
	 * @returns {Promise<void>}
	 * @memberof ActiveWorkflows
	 */
	async add(id: string, workflow: Workflow, additionalData: IWorkflowExecuteAdditionalData, getTriggerFunctions: IGetExecuteTriggerFunctions, getPollFunctions: IGetExecutePollFunctions): Promise<void> {
		this.workflowData[id] = {};
		const triggerNodes = workflow.getTriggerNodes();

		let triggerResponse: ITriggerResponse | undefined;
		this.workflowData[id].triggerResponses = [];
		for (const triggerNode of triggerNodes) {
			triggerResponse = await workflow.runTrigger(triggerNode, getTriggerFunctions, additionalData, 'trigger');
			if (triggerResponse !== undefined) {
				// If a response was given save it
				this.workflowData[id].triggerResponses!.push(triggerResponse);
			}
		}

		const pollNodes = workflow.getPollNodes();
		if (pollNodes.length) {
			this.workflowData[id].pollResponses = [];
			for (const pollNode of pollNodes) {
				this.workflowData[id].pollResponses!.push(await this.activatePolling(pollNode, workflow, additionalData, getPollFunctions));
			}
		}
	}


	/**
	 * Activates polling for the given node
	 *
	 * @param {INode} node
	 * @param {Workflow} workflow
	 * @param {IWorkflowExecuteAdditionalData} additionalData
	 * @param {IGetExecutePollFunctions} getPollFunctions
	 * @returns {Promise<IPollResponse>}
	 * @memberof ActiveWorkflows
	 */
	async activatePolling(node: INode, workflow: Workflow, additionalData: IWorkflowExecuteAdditionalData, getPollFunctions: IGetExecutePollFunctions): Promise<IPollResponse> {
		const mode = 'trigger';

		const pollFunctions = getPollFunctions(workflow, node, additionalData, mode);

		const pollTimes = pollFunctions.getNodeParameter('pollTimes') as unknown as {
			item: ITriggerTime[];
		};

		// Define the order the cron-time-parameter appear
		const parameterOrder = [
			'second',     // 0 - 59
			'minute',     // 0 - 59
			'hour',       // 0 - 23
			'dayOfMonth', // 1 - 31
			'month',      // 0 - 11(Jan - Dec)
			'weekday',    // 0 - 6(Sun - Sat)
		];

		// Get all the trigger times
		const cronTimes: string[] = [];
		let cronTime: string[];
		let parameterName: string;
		if (pollTimes.item !== undefined) {
			for (const item of pollTimes.item) {
				cronTime = [];
				if (item.mode === 'custom') {
					cronTimes.push((item.cronExpression as string).trim());
					continue;
				}
				if (item.mode === 'everyMinute') {
					cronTimes.push(`${Math.floor(Math.random() * 60).toString()} * * * * *`);
					continue;
				}
				if (item.mode === 'everyX') {
					if (item.unit === 'minutes') {
						cronTimes.push(`${Math.floor(Math.random() * 60).toString()} */${item.value} * * * *`);
					} else if (item.unit === 'hours') {
						cronTimes.push(`${Math.floor(Math.random() * 60).toString()} 0 */${item.value} * * *`);
					}
					continue;
				}

				for (parameterName of parameterOrder) {
					if (item[parameterName] !== undefined) {
						// Value is set so use it
						cronTime.push(item[parameterName] as string);
					} else if (parameterName === 'second') {
						// For seconds we use by default a random one to make sure to
						// balance the load a little bit over time
						cronTime.push(Math.floor(Math.random() * 60).toString());
					} else {
						// For all others set "any"
						cronTime.push('*');
					}
				}

				cronTimes.push(cronTime.join(' '));
			}
		}

		// The trigger function to execute when the cron-time got reached
		const executeTrigger = async () => {
			Logger.info(`Polling trigger initiated for workflow ${workflow.name}`, {workflowName: workflow.name, workflowId: workflow.id});
			const pollResponse = await workflow.runPoll(node, pollFunctions);

			if (pollResponse !== null) {
				pollFunctions.__emit(pollResponse);
			}
		};

		// Execute the trigger directly to be able to know if it works
		await executeTrigger();

		const timezone = pollFunctions.getTimezone();

		// Start the cron-jobs
		const cronJobs: CronJob[] = [];
		for (const cronTime of cronTimes) {
			const cronTimeParts = cronTime.split(' ');
			if (cronTimeParts.length > 0 && cronTimeParts[0].includes('*')) {
				throw new Error('The polling interval is too short. It has to be at least a minute!');
			}

			cronJobs.push(new CronJob(cronTime, executeTrigger, undefined, true, timezone));
		}

		// Stop the cron-jobs
		async function closeFunction() {
			for (const cronJob of cronJobs) {
				cronJob.stop();
			}
		}

		return {
			closeFunction,
		};
	}


	/**
	 * Makes a workflow inactive
	 *
	 * @param {string} id The id of the workflow to deactivate
	 * @returns {Promise<void>}
	 * @memberof ActiveWorkflows
	 */
	async remove(id: string): Promise<void> {
		if (!this.isActive(id)) {
			// Workflow is currently not registered
			throw new Error(`The workflow with the id "${id}" is currently not active and can so not be removed`);
		}

		const workflowData = this.workflowData[id];

		if (workflowData.triggerResponses) {
			for (const triggerResponse of workflowData.triggerResponses) {
				if (triggerResponse.closeFunction) {
					await triggerResponse.closeFunction();
				}
			}
		}

		if (workflowData.pollResponses) {
			for (const pollResponse of workflowData.pollResponses) {
				if (pollResponse.closeFunction) {
					await pollResponse.closeFunction();
				}
			}
		}

		delete this.workflowData[id];
	}

}
