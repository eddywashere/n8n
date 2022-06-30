import { INodeType, INodeTypeDescription } from 'n8n-workflow';
import { attributeFields, attributeOperations } from './AttributeDescription';
import { contactFields, contactOperations } from './ContactDescription';
import { emailFields, emailOperations } from './EmailDescription';
import { senderFields, senderOperations } from './SenderDescrition';

export class SendInBlue implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SendInBlue',
		name: 'sendinblue',
		icon: 'file:sendinblue.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume Sendinblue API',
		defaults: {
			name: 'SendInBlue',
			color: '#044a75',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'sendinblueApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: 'https://api.sendinblue.com',
			url: '',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Email',
						value: 'email',
					},
					{
						name: 'Contact',
						value: 'contact',
					},
					{
						name: 'Sender',
						value: 'sender',
					},
					{
						name: 'Contact Attribute',
						value: 'attribute',
					},
				],
				default: 'email',
			},

			...attributeOperations,
			...attributeFields,
			...senderOperations,
			...senderFields,
			...contactOperations,
			...contactFields,
			...emailOperations,
			...emailFields,
		],
	};
}
