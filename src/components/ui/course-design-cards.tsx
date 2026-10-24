import React from 'react';
import { MoreVertical, Plus } from 'lucide-react';

// Define the type for the card data
export interface CardData {
  id: number;
  colorClass: string;
  date: string;
  title: string;
  description: string;
  progressPercent: string;
  progressValue: string;
  imgSrc1?: string;
  imgAlt1?: string;
  imgSrc2?: string;
  imgAlt2?: string;
  countdownText: string;
}

// Define the props for the Card component
export interface CardProps {
  data: CardData;
}

// Ellipsis Icon (three vertical dots matching the screenshot)
const EllipsisIcon: React.FC = () => (
  <MoreVertical className="w-5 h-5 text-white/80 hover:text-white transition-colors" />
);

// Add Icon
const AddIcon: React.FC = () => (
  <Plus className="w-4 h-4 text-white stroke-[2.5]" />
);

export const Card: React.FC<CardProps> = ({ data }) => {
  const {
    colorClass,
    date,
    title,
    description,
    progressPercent,
    progressValue,
    imgSrc1,
    imgAlt1,
    imgSrc2,
    imgAlt2,
    countdownText,
  } = data;

  return (
    <div
      className={`card ${colorClass}`}
      style={{ '--progress-pct': progressPercent } as React.CSSProperties}
    >
      {/* Upper Main Card Surface with Corner Gradient Glow */}
      <div className="card-main">
        <div className="card-header">
          <div className="date">{date}</div>
          <button
            type="button"
            aria-label="More options"
            className="btn-more inline-flex items-center justify-center p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <EllipsisIcon />
          </button>
        </div>

        <div className="card-body">
          <h3>{title}</h3>
          <p>{description}</p>
          <div className="progress">
            <span className="progress-label">Progress</span>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: progressPercent }}
              />
            </div>
            <span className="progress-value">{progressValue}</span>
          </div>
        </div>
      </div>

      {/* Bottom Footer Shelf */}
      <div className="card-footer">
        <ul>
          {imgSrc1 && (
            <li>
              <img src={imgSrc1} alt={imgAlt1 || 'User avatar'} loading="lazy" />
            </li>
          )}
          {imgSrc2 && (
            <li>
              <img src={imgSrc2} alt={imgAlt2 || 'User avatar'} loading="lazy" />
            </li>
          )}
          <li>
            <a href="#" className="btn-add" aria-label="Add user">
              <AddIcon />
            </a>
          </li>
        </ul>
        <a href="#" className="btn-countdown">
          {countdownText}
        </a>
      </div>
    </div>
  );
};

export default Card;
