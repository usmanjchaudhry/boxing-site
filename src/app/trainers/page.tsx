import Image from 'next/image'
import Navbar from '@/components/Navbar'

const trainers = [
  {
    name: 'Coach Trini',
    role: 'Coach',
    image: '/images/coaches/coachTrini.PNG',
    specialties: ['Pad Work', 'Sparring']
  },
  {
    name: 'Coach Soldier',
    role: 'Coach',
    image: '/images/coaches/coachSoldier.PNG',
    specialties: ['Cardio Boxing', 'Endurance']
  },
  {
    name: 'Coach Markos',
    role: 'Head Coach',
    image: '/images/coaches/coachMarkos.PNG',
    specialties: ['Boxing Fundamentals', 'Strength & Conditioning']
  },
  {
    name: 'Coach Sergei',
    role: 'Coach',
    image: '/images/coaches/coachSergei.PNG',
    specialties: ['Technical Training', 'Fight Preparation']
  }
]

export default function TrainersPage() {
  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-red-500 selection:text-white pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16">
        {/* Header */}
        <div className="text-center mb-16 sm:mb-24">
          <h1 className="text-4xl sm:text-6xl font-black mb-6 uppercase tracking-tight">
            Meet Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-800">Corner</span>
          </h1>
          <p className="text-zinc-400 text-lg sm:text-xl max-w-2xl mx-auto">
            Our trainers are seasoned professionals with real ring experience. 
            Whether you are training for fitness or fighting for a title, they will push you to your absolute limit.
          </p>
        </div>

        {/* Trainers Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          {trainers.map((trainer, index) => (
            <div 
              key={index} 
              className="group relative bg-zinc-950 border border-zinc-900 rounded-3xl overflow-hidden hover:border-red-900/50 transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(220,38,38,0.2)]"
            >
              {/* Image Container — taller on mobile so faces aren't cropped */}
              <div className="relative aspect-[3/4] sm:aspect-[4/5] w-full overflow-hidden">
                {/* Subtle bottom gradient only — lets the photo breathe */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent z-10" />
                <Image 
                  src={trainer.image} 
                  alt={trainer.name}
                  fill
                  className="object-cover object-[center_10%] transition-transform duration-700 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
                
                {/* Text overlay pinned to bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 z-20">
                  <p className="text-red-500 font-bold tracking-widest text-[10px] sm:text-xs uppercase mb-1">
                    {trainer.role}
                  </p>
                  <h3 className="text-xl sm:text-2xl font-black mb-2">
                    {trainer.name}
                  </h3>
                  
                  {/* Specialties — always visible on mobile, slide up on desktop hover */}
                  <div className="sm:grid sm:grid-rows-[0fr] sm:group-hover:grid-rows-[1fr] sm:transition-[grid-template-rows] sm:duration-500 sm:ease-out">
                    <div className="sm:overflow-hidden">
                      <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-1">
                        {trainer.specialties.map((spec, i) => (
                          <span key={i} className="px-2.5 py-1 bg-red-950/60 border border-red-900/50 text-red-300 text-[10px] uppercase font-bold tracking-wider rounded-full backdrop-blur-sm">
                            {spec}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
