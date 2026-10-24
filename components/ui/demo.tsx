import React from 'react';
import Card, { type CardData } from '@/components/ui/course-design-cards';
import '@/index.css';

export const DefaultDemo: React.FC = () => {
  const cardData: CardData[] = [
    {
      id: 1,
      colorClass: 'purple',
      date: 'March 08, 2026',
      title: 'web designing',
      description: 'Wireframing',
      progressPercent: '20%',
      progressValue: '20%',
      imgSrc1: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&h=120&q=80',
      imgAlt1: 'Erik Longman',
      imgSrc2: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&h=120&q=80',
      imgAlt2: 'Jane Doe',
      countdownText: '3 weeks left',
    },
    {
      id: 2,
      colorClass: 'purple-deep',
      date: 'Feb 05, 2026',
      title: 'mobile app',
      description: 'Shopping Interface',
      progressPercent: '30%',
      progressValue: '30%',
      imgSrc1: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=120&h=120&q=80',
      imgAlt1: 'Alex Rivera',
      imgSrc2: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=120&h=120&q=80',
      imgAlt2: 'Jessica Jones',
      countdownText: '3 weeks left',
    },
    {
      id: 3,
      colorClass: 'purple',
      date: 'March 03, 2026',
      title: 'prop analytics',
      description: 'Payout Intelligence',
      progressPercent: '50%',
      progressValue: '50%',
      imgSrc1: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=120&h=120&q=80',
      imgAlt1: 'Rachel Green',
      imgSrc2: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=120&h=120&q=80',
      imgAlt2: 'James Wilson',
      countdownText: '3 weeks left',
    },
    {
      id: 4,
      colorClass: 'purple-light',
      date: 'Feb 2, 2026',
      title: 'challenge tracker',
      description: 'Live Verification',
      progressPercent: '90%',
      progressValue: '90%',
      imgSrc1: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&h=120&q=80',
      imgAlt1: 'Emily Watson',
      imgSrc2: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&h=120&q=80',
      imgAlt2: 'Michael Chang',
      countdownText: '2 days left',
    },
  ];

  return (
    <section className="course-cards-container">
      {cardData.map((card) => (
        <Card key={card.id} data={card} />
      ))}
    </section>
  );
};

export default DefaultDemo;
