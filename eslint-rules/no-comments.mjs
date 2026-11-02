export const noComments = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow every comment except the shebang line' },
    schema: [],
    messages: {
      comment:
        'Comments are not allowed. Put the reasoning in the commit body, the pull request, an ADR or the README.',
    },
  },
  create(context) {
    return {
      Program() {
        context.sourceCode
          .getAllComments()
          .filter((comment) => comment.type !== 'Shebang')
          .forEach((comment) => {
            context.report({ loc: comment.loc, messageId: 'comment' });
          });
      },
    };
  },
};
