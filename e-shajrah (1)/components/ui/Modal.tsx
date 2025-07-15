
import React, { forwardRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
}

const Modal = forwardRef<HTMLDivElement, ModalProps>(({ isOpen, onClose, title, children, className = '', headerActions }, ref) => {
  if (!isOpen) return null;

  return (
    <div ref={ref} className={`fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center ${className}`} onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 animate-fadeIn printable-area" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start border-b pb-3 border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold flex-grow">{title}</h2>
          <div className="flex-shrink-0 flex items-center space-x-2 ml-4 no-print">
            {headerActions}
            <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white">&times;</button>
          </div>
        </div>
        <div className="mt-4">
          {children}
        </div>
      </div>
    </div>
  );
});

Modal.displayName = 'Modal';

export default Modal;
