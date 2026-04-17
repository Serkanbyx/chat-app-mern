import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import CharacterCounter from '../common/CharacterCounter.jsx';
import Modal from '../common/Modal.jsx';
import Spinner from '../common/Spinner.jsx';
import { reportTarget } from '../../api/user.service.js';
import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
} from '../../utils/constants.js';

/**
 * ReportModal — file an abuse report against a user OR a message.
 *
 * Why one component for both:
 *   - The server endpoint (`POST /api/reports`) accepts a discriminated
 *     payload via `targetType`. Splitting this into two components
 *     would duplicate every piece of UX (reason picker, optional
 *     details, submit state) for no functional gain.
 *
 * Behaviour:
 *   - Reason is required (radios).
 *   - Free-text details are optional, capped at REPORT_DETAILS_MAX_LENGTH.
 *   - State resets every time the dialog opens so a previous half-typed
 *     report doesn't leak into a new submission.
 *   - The actual API call is owned here (not the parent) because every
 *     surface that triggers a report wants the same toast + close
 *     behaviour, and the response payload is uninteresting downstream.
 */
const TARGET_LABEL = {
  user: 'user',
  message: 'message',
};

const ReportModal = ({ open, onClose, targetType, targetId, targetLabel }) => {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setDetails('');
    setError(null);
    setSubmitting(false);
  }, [open]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    if (!reason) {
      setError('Please choose a reason.');
      return;
    }
    if (!targetType || !targetId) {
      setError('Missing report target.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await reportTarget({
        targetType,
        targetId,
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
      });
      toast.success('Report submitted. Our team will review it.');
      onClose?.();
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        'Could not submit the report. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const heading = targetLabel
    ? `Report ${targetLabel}`
    : `Report ${TARGET_LABEL[targetType] ?? 'item'}`;

  return (
    <Modal
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title={heading}
      description="Tell us what's wrong. Reports stay anonymous."
      size="md"
      closeOnBackdrop={!submitting}
      closeOnEscape={!submitting}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="report-form"
            disabled={submitting || !reason}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-gray-950"
          >
            {submitting ? <Spinner size="sm" /> : null}
            <span>Submit report</span>
          </button>
        </>
      }
    >
      <form
        id="report-form"
        onSubmit={handleSubmit}
        className="space-y-4 px-5 py-4"
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-900 dark:text-white">
            Reason
          </legend>
          <div className="space-y-1.5">
            {REPORT_REASONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <input
                  type="radio"
                  name="reason"
                  value={option.value}
                  checked={reason === option.value}
                  onChange={() => setReason(option.value)}
                  className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-900 dark:text-white">
            More details <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <textarea
            value={details}
            onChange={(event) =>
              setDetails(event.target.value.slice(0, REPORT_DETAILS_MAX_LENGTH))
            }
            rows={4}
            maxLength={REPORT_DETAILS_MAX_LENGTH}
            placeholder="What happened?"
            className="w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          <CharacterCounter
            current={details.length}
            max={REPORT_DETAILS_MAX_LENGTH}
            className="mt-1"
          />
        </label>

        {error ? (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300"
          >
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
};

export default ReportModal;
