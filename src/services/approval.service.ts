import inquirer from 'inquirer';
import chalk from 'chalk';
import { GeneratedReply } from '../models/generated-reply';

export class ApprovalService {
  async approveReplies(replies: GeneratedReply[]): Promise<GeneratedReply[]> {
    const pending = replies.filter((r) => r.status === 'pending');

    if (pending.length === 0) {
      return replies;
    }

    console.log(chalk.cyan('\n  Reply Approval\n'));

    const approved: GeneratedReply[] = [];

    for (const reply of pending) {
      const reviewer = reply.reviewerName ?? 'Anonymous';
      console.log(chalk.bold(`\nReviewer: ${reviewer}`));
      if (reply.originalComment) {
        console.log(chalk.dim(`Review: ${reply.originalComment}`));
      }
      console.log(`Proposed reply:\n${reply.generatedReply}\n`);

      const { action } = await inquirer.prompt<{ action: string }>([
        {
          type: 'list',
          name: 'action',
          message: 'Action:',
          choices: [
            { name: 'Approve and post', value: 'approve' },
            { name: 'Edit reply', value: 'edit' },
            { name: 'Skip this review', value: 'skip' },
            { name: 'Reject', value: 'reject' },
          ],
        },
      ]);

      if (action === 'approve') {
        approved.push({ ...reply, status: 'approved' });
      } else if (action === 'edit') {
        const { editedReply } = await inquirer.prompt<{ editedReply: string }>([
          {
            type: 'editor',
            name: 'editedReply',
            message: 'Edit the reply:',
            default: reply.generatedReply,
          },
        ]);
        approved.push({ ...reply, generatedReply: editedReply.trim(), status: 'approved' });
      } else if (action === 'reject') {
        approved.push({ ...reply, status: 'rejected' });
      } else {
        approved.push({ ...reply, status: 'rejected' });
      }
    }

    const resultMap = new Map(approved.map((r) => [r.reviewId, r]));

    return replies.map((r) => resultMap.get(r.reviewId) ?? r);
  }

  autoApprove(replies: GeneratedReply[]): GeneratedReply[] {
    return replies.map((r) =>
      r.status === 'pending' ? { ...r, status: 'approved' as const } : r
    );
  }
}
